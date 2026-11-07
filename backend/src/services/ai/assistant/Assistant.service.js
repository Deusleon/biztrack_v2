import { generateText, getProviderStatus } from '../aiProvider.service.js';
import registry from './ToolRegistry.js';
import { classifyIntent } from './Intent.service.js';
import { buildAssistantPrompt } from './Prompt.service.js';
import { getConversation, saveTurn } from './Conversation.service.js';
import { resolvePermissionSet } from '../core/PermissionResolver.js';
import { writeAudit } from '../core/Audit.service.js';
import { runNativeFunctionCalling } from './NativeFunctionCalling.service.js';
function deniedAnswer(lang, denied) {
  const names = denied.map((item) => item.id || item.name).join(', ');
  return lang === 'sw'
    ? `Huna ruhusa ya kutumia taarifa zinazohitajika kwa swali hili (${names}). Muombe msimamizi akupe permission husika ya BizTrack AI.`
    : `You do not have permission to access the data required for this question (${names}). Ask an administrator to assign the relevant BizTrack AI permission.`;
}

function fallbackAnswer(lang, tools, error) {
  const names = tools.join(', ');
  return lang === 'sw'
    ? `Nimepata data iliyohakikiwa kupitia ${names}, lakini AI provider haikupatikana kuitafsiri. ${error ? `Sababu: ${error}` : ''}`.trim()
    : `Verified data was retrieved through ${names}, but the AI provider was unavailable. ${error ? `Reason: ${error}` : ''}`.trim();
}

async function runControlledRouting({ storeId, userId, message, lang, conversation, permissions }) {
  const intent = classifyIntent(message, conversation);
  const execution = await registry.execute(intent.tools, { storeId, userId, lang }, permissions);
  let answer;
  let source = 'permission';
  let provider = 'none';
  let model = null;
  let providerError = null;

  if (!execution.executed.length && execution.denied.length) {
    answer = deniedAnswer(lang, execution.denied);
  } else {
    const prompt = buildAssistantPrompt({
      message,
      lang,
      history: conversation.messages,
      toolResults: execution.results,
      toolsUsed: execution.executed,
    });
    const generated = await generateText({ instructions: prompt.instructions, input: prompt.input, maxOutputTokens: 700 });
    const status = getProviderStatus();
    source = generated.text ? 'ai' : 'fallback';
    provider = generated.text ? generated.provider : 'fallback';
    model = generated.model || status.model;
    providerError = generated.error || null;
    answer = generated.text || fallbackAnswer(lang, execution.executed, generated.error);
  }

  return {
    answer,
    source,
    provider,
    model,
    providerError,
    toolsRequested: intent.tools,
    toolsExecuted: execution.executed,
    toolsDenied: execution.denied,
    toolErrors: execution.missing || [],
    confidence: execution.executed.length === intent.tools.length
      ? 'high'
      : execution.executed.length
        ? 'limited'
        : 'unavailable',
    followUp: intent.followUp,
    selectionStrategy: 'controlled_routing',
    rounds: 0,
    usage: {},
  };
}

async function askAssistant({ storeId, userId, message, lang, conversationId }) {
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

    const conversation = await getConversation({ storeId, userId, conversationId, firstMessage: message });
    audit.conversationId = conversation.id;

    let result;
    let nativeError = null;
    const nativeEnabled = String(process.env.AI_NATIVE_FUNCTION_CALLING || 'true').toLowerCase() !== 'false';

    if (nativeEnabled) {
      try {
        const native = await runNativeFunctionCalling({
          registry,
          permissions,
          storeId,
          userId,
          message,
          lang,
          history: conversation.messages,
        });

        if (native.supported) {
          const hasToolProblems = native.toolsDenied.length > 0 || native.toolErrors.length > 0;
          result = {
            answer: native.answer,
            source: 'ai',
            provider: native.provider,
            model: native.model,
            providerError: null,
            toolsRequested: native.callsRequested,
            toolsExecuted: native.toolsExecuted,
            toolsDenied: native.toolsDenied,
            toolErrors: native.toolErrors,
            confidence: native.toolsExecuted.length
              ? (hasToolProblems ? 'limited' : 'high')
              : 'general',
            followUp: conversation.messages.length > 0,
            selectionStrategy: native.selectionStrategy,
            rounds: native.rounds,
            usage: native.usage,
          };
        }
      } catch (error) {
        nativeError = error.message;
        console.error('Native AI function calling failed; using controlled routing:', error.message);
      }
    }

    if (!result) {
      result = await runControlledRouting({ storeId, userId, message, lang, conversation, permissions });
      if (nativeError) result.providerError = result.providerError || nativeError;
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

    const toolsRequestedByAI = result.selectionStrategy === 'native_function_calling'
      ? result.toolsRequested
      : [];

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
      },
    });

    await writeAudit(audit);

    return {
      conversationId: conversation.id,
      answer: result.answer,
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
      sources: result.toolsExecuted.map((name) => ({ name, verified: true })),
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

