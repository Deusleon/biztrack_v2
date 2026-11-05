import { generateText, getProviderStatus } from '../aiProvider.service.js';
import registry from './ToolRegistry.js';
import { classifyIntent } from './Intent.service.js';
import { buildAssistantPrompt } from './Prompt.service.js';
import { getConversation, saveTurn } from './Conversation.service.js';
import { resolvePermissionSet } from '../core/PermissionResolver.js';
import { writeAudit } from '../core/Audit.service.js';
import { runNativeFunctionCalling } from './NativeFunctionCalling.service.js';
import { businessToday } from './periods.js';
import { loadStoreFormat } from './storeFormat.js';
import {
  actionsFor, compactVerified, fallbackAnswer, figuresAnswer, plainText, sourcesFor, splitAnswer,
} from './present.js';

function clarifyAnswer(lang) {
  return lang === 'sw'
    ? 'Niambie unachotaka kujua kutoka kwenye kumbukumbu za duka: mauzo, faida, bidhaa zinazokaribia kuisha, madeni, manunuzi, marejesho, au kulinganisha maduka. Nitajibu swali hilo kwa tarakimu zilizohakikiwa.'
    : 'Tell me what you want from the store records: sales, profit, products running low, debts, purchases, returns, or a comparison of your stores. I will answer that question with the verified figures.';
}

function deniedAnswer(lang, denied) {
  const names = denied.map((item) => item.id || item.name).join(', ');
  return lang === 'sw'
    ? `Huna ruhusa ya kutumia taarifa zinazohitajika kwa swali hili (${names}). Muombe msimamizi akupe ruhusa husika.`
    : `You do not have permission to access the data required for this question (${names}). Ask an administrator to assign the relevant permission.`;
}

function answerWithFigures(answer, figures) {
  const text = String(answer || '').trim();
  const lead = String(figures || '').trim();
  const empty = !lead || lead.startsWith('There are no verified') || lead.startsWith('Hakuna tarakimu');
  if (empty) return text;
  if (!text) return lead;
  const first = lead.split('\n').map((line) => line.trim()).find(Boolean) || '';
  if (first && text.includes(first)) return text;
  return `${lead}\n\n${text}`;
}

function present(lang, tools, results, format) {
  return {
    figures: figuresAnswer(lang, results, format),
    sources: sourcesFor(tools, lang),
    actions: actionsFor(results, lang, format),
  };
}

async function runControlledRouting({ storeId, userId, message, lang, conversation, permissions, format, today, onFigures }) {
  const intent = classifyIntent(message, conversation);
  if (intent.clarify) {
    return {
      answer: clarifyAnswer(lang),
      source: 'clarify',
      provider: 'none',
      model: null,
      providerError: null,
      toolsRequested: [],
      toolsExecuted: [],
      toolsDenied: [],
      toolErrors: [],
      toolResults: {},
      confidence: 'unavailable',
      followUp: false,
      selectionStrategy: 'clarify',
      rounds: 0,
      usage: {},
      figures: '',
      sources: [],
      actions: [],
    };
  }
  const context = { storeId, userId, lang, period: intent.period, today };
  let results = {};
  let executed = [];
  let denied = [];
  let missing = [];

  if (intent.reuseFigures) {
    const saved = conversation.verifiedContext || {};
    for (const id of intent.tools) {
      if (saved[id]) {
        results[id] = saved[id];
        executed.push(id);
      }
    }
    const absent = intent.tools.filter((id) => !results[id]);
    if (absent.length) {
      const extra = await registry.execute(absent, context, permissions);
      Object.assign(results, extra.results);
      executed.push(...extra.executed);
      denied = extra.denied;
      missing = extra.missing || [];
    }
  } else {
    const execution = await registry.execute(intent.tools, context, permissions);
    results = execution.results;
    executed = execution.executed;
    denied = execution.denied;
    missing = execution.missing || [];
  }

  const shown = present(lang, executed, results, format);
  if (onFigures && executed.length) onFigures(shown);

  let answer;
  let source = 'permission';
  let provider = 'none';
  let model = null;
  let providerError = null;

  if (!executed.length && denied.length) {
    answer = deniedAnswer(lang, denied);
  } else {
    const prompt = buildAssistantPrompt({
      message,
      lang,
      history: conversation.messages,
      toolResults: results,
      toolsUsed: executed,
      format,
      priorVerified: intent.reuseFigures ? conversation.verifiedContext : null,
      today,
    });
    const generated = await generateText({ instructions: prompt.instructions, input: prompt.input, maxOutputTokens: 700 });
    const status = getProviderStatus();
    source = generated.text ? 'ai' : 'fallback';
    provider = generated.text ? generated.provider : 'fallback';
    model = generated.model || status.model;
    providerError = generated.error || null;
    answer = generated.text
      ? answerWithFigures(plainText(generated.text), shown.figures)
      : fallbackAnswer(lang, results, format);
  }

  return {
    answer,
    source,
    provider,
    model,
    providerError,
    toolsRequested: intent.tools,
    toolsExecuted: executed,
    toolsDenied: denied,
    toolErrors: missing,
    toolResults: results,
    confidence: executed.length === intent.tools.length ? 'high' : executed.length ? 'limited' : 'unavailable',
    followUp: intent.followUp,
    selectionStrategy: 'controlled_routing',
    rounds: 0,
    usage: {},
    ...shown,
  };
}

async function askAssistant({ storeId, userId, message, lang, conversationId, onEvent }) {
  const started = Date.now();
  const audit = {
    storeId,
    userId,
    question: message,
    toolsRequested: [],
    toolsExecuted: [],
    toolsDenied: [],
    status: 'success',
  };

  try {
    const permissions = await resolvePermissionSet(userId, storeId);
    if (!permissions.has('ai_chat')) {
      const error = new Error('AI chat permission required');
      error.statusCode = 403;
      throw error;
    }

    const [conversation, format] = await Promise.all([
      getConversation({ storeId, userId, conversationId, firstMessage: message }),
      loadStoreFormat(storeId),
    ]);
    audit.conversationId = conversation.id;
    const today = businessToday();
    const intent = classifyIntent(message, conversation);
    if (onEvent) onEvent({ type: 'status', text: 'checking' });

    let result;
    let nativeError = null;
    const nativeEnabled = String(process.env.AI_NATIVE_FUNCTION_CALLING || 'true').toLowerCase() !== 'false';
    let figuresSent = false;
    const emitFigures = (shown, tools) => {
      if (!onEvent || figuresSent) return;
      figuresSent = true;
      onEvent({ type: 'figures', answer: shown.figures, sources: shown.sources, actions: shown.actions, tools });
    };

    if (nativeEnabled && !intent.reuseFigures && !intent.clarify) {
      try {
        const native = await runNativeFunctionCalling({
          registry,
          permissions,
          storeId,
          userId,
          message,
          lang,
          history: conversation.messages,
          format,
          priorVerified: conversation.verifiedContext,
          today,
          period: intent.period,
          onResults: (toolResults) => {
            const tools = Object.keys(toolResults);
            emitFigures(present(lang, tools, toolResults, format), tools);
          },
        });

        const expectedTools = intent.tools || [];
        const ranTools = native.toolsExecuted || [];
        const missedTools = expectedTools.length > 0 && ranTools.length === 0;
        if (native.supported && !missedTools) {
          const hasToolProblems = native.toolsDenied.length > 0 || native.toolErrors.length > 0;
          const shown = present(lang, native.toolsExecuted, native.toolResults, format);
          emitFigures(shown, native.toolsExecuted);
          const modelText = plainText(native.answer);
          result = {
            answer: modelText ? answerWithFigures(modelText, shown.figures) : fallbackAnswer(lang, native.toolResults, format),
            source: modelText ? 'ai' : 'fallback',
            provider: native.provider,
            model: native.model,
            providerError: null,
            toolsRequested: native.callsRequested,
            toolsExecuted: native.toolsExecuted,
            toolsDenied: native.toolsDenied,
            toolErrors: native.toolErrors,
            toolResults: native.toolResults,
            confidence: native.toolsExecuted.length ? (hasToolProblems ? 'limited' : 'high') : 'general',
            followUp: conversation.messages.length > 0,
            selectionStrategy: native.selectionStrategy,
            rounds: native.rounds,
            usage: native.usage,
            ...shown,
          };
        } else if (missedTools && native.supported) {
          figuresSent = false;
          nativeError = 'Native function calling did not read the store records for this question';
        }
      } catch (error) {
        nativeError = error.message;
        console.error('Native AI function calling failed; using controlled routing:', error.message);
      }
    }

    if (!result) {
      result = await runControlledRouting({
        storeId, userId, message, lang, conversation, permissions, format, today,
        onFigures: (shown) => emitFigures(shown, []),
      });
      if (nativeError) result.providerError = result.providerError || nativeError;
    }

    if (onEvent && result.answer) {
      for (const part of splitAnswer(result.answer)) {
        onEvent({ type: 'delta', text: part });
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }

    audit.toolsRequested = result.toolsRequested;
    audit.toolsExecuted = result.toolsExecuted;
    audit.toolsDenied = result.toolsDenied;
    Object.assign(audit, {
      provider: result.provider,
      model: result.model,
      source: result.source,
      confidence: result.confidence,
      latencyMs: Date.now() - started,
      inputTokens: result.usage?.inputTokens || null,
      outputTokens: result.usage?.outputTokens || null,
      metadata: {
        selectionStrategy: result.selectionStrategy,
        toolRounds: result.rounds,
        toolErrors: result.toolErrors,
        nativeError,
        totalTokens: result.usage?.totalTokens || null,
      },
    });

    const toolsRequestedByAI = result.selectionStrategy === 'native_function_calling' ? result.toolsRequested : [];
    const verified = compactVerified({ ...(conversation.verifiedContext || {}), ...(result.toolResults || {}) });

    await saveTurn({
      conversation,
      userMessage: message,
      answer: result.answer,
      toolsUsed: result.toolsExecuted,
      provider: result.provider,
      model: result.model,
      confidence: result.confidence,
      source: result.source,
      metadata: {
        providerError: result.providerError,
        followUp: result.followUp,
        toolsDenied: result.toolsDenied,
        toolErrors: result.toolErrors,
        toolsRequestedByAI,
        toolSelectionStrategy: result.selectionStrategy,
        toolRounds: result.rounds,
        usage: result.usage,
        verified,
        sources: result.sources,
        actions: result.actions,
      },
    });

    await writeAudit(audit);

    return {
      conversationId: conversation.id,
      answer: result.answer,
      figures: result.figures,
      source: result.source,
      provider: result.provider,
      requestedProvider: getProviderStatus().requested,
      model: result.model,
      providerError: result.providerError,
      toolsRequestedByAI,
      toolsUsed: result.toolsExecuted,
      toolsDenied: result.toolsDenied,
      toolErrors: result.toolErrors,
      toolSelectionStrategy: result.selectionStrategy,
      toolRounds: result.rounds,
      sources: result.sources,
      actions: result.actions,
      confidence: result.confidence,
      followUp: result.followUp,
      usage: result.usage,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    Object.assign(audit, {
      status: 'error',
      errorMessage: error.message,
      latencyMs: Date.now() - started,
    });
    await writeAudit(audit);
    throw error;
  }
}

export { askAssistant };
