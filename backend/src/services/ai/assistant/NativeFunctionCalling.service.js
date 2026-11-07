import { createProvider } from '../AIProviderFactory.js';
import { buildNativeAssistantPrompt } from './Prompt.service.js';
function buildFunctionResponsePart(response) {
  const payload = response.status === 'success'
    ? { result: response.result }
    : {
        error: {
          status: response.status,
          message: response.error || 'Tool execution failed',
          validationErrors: response.validationErrors || undefined,
          requiredPermissions: response.requiredPermissions || undefined,
        },
      };

  const functionResponse = {
    name: response.name,
    response: payload,
  };
  if (response.id) functionResponse.id = response.id;
  return { functionResponse };
}

function mergeUsage(total, usage) {
  return {
    inputTokens: (total.inputTokens || 0) + (Number(usage?.promptTokenCount) || 0),
    outputTokens: (total.outputTokens || 0) + (Number(usage?.candidatesTokenCount) || 0),
    totalTokens: (total.totalTokens || 0) + (Number(usage?.totalTokenCount) || 0),
  };
}

async function runNativeFunctionCalling({ registry, permissions, storeId, userId, message, lang, history }) {
  const provider = createProvider();
  if (!provider.isConfigured() || typeof provider.supportsFunctionCalling !== 'function' || !provider.supportsFunctionCalling()) {
    return { supported: false, provider: provider.name, model: provider.model };
  }

  const declarations = registry.toFunctionDeclarations(permissions);
  if (!declarations.length) {
    return { supported: false, provider: provider.name, model: provider.model, reason: 'No permitted tools available' };
  }

  const maxCalls = Math.max(Number(process.env.AI_MAX_TOOL_CALLS) || 4, 1);
  const maxRounds = Math.min(Math.max(Number(process.env.AI_MAX_TOOL_ROUNDS) || 2, 1), 4);
  const toolTimeoutMs = Math.max(Number(process.env.AI_TOOL_TIMEOUT_MS) || 10000, 1000);
  const prompt = buildNativeAssistantPrompt({ lang, history, message });
  const contents = prompt.contents;
  const callsRequested = [];
  const toolsExecuted = [];
  const toolsDenied = [];
  const toolErrors = [];
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let totalCalls = 0;
  let finalText = '';
  let rounds = 0;

  for (let round = 1; round <= maxRounds; round += 1) {
    rounds = round;
    const remainingCalls = maxCalls - totalCalls;
    const response = await provider.generateWithTools({
      instructions: prompt.instructions,
      contents,
      functionDeclarations: declarations,
      maxOutputTokens: 900,
      functionCallingMode: remainingCalls > 0 ? 'AUTO' : 'NONE',
    });
    usage = mergeUsage(usage, response.usageMetadata);

    if (!response.calls.length) {
      finalText = response.text;
      break;
    }

    contents.push(response.modelContent);
    const callsForExecution = response.calls.slice(0, Math.max(remainingCalls, 0));
    const skippedCalls = response.calls.slice(callsForExecution.length).map((call) => ({
      id: call.id,
      name: call.name,
      args: call.args,
      status: 'limit_exceeded',
      error: `Maximum of ${maxCalls} tool calls per request exceeded`,
    }));

    callsRequested.push(...response.calls.map((call) => ({
      id: call.id || null,
      name: call.name,
      args: call.args || {},
      round,
    })));

    const execution = await registry.executeCalls(
      callsForExecution,
      { storeId, userId, lang },
      permissions,
      { maxCalls: remainingCalls, timeoutMs: toolTimeoutMs },
    );

    totalCalls += callsForExecution.length;
    toolsExecuted.push(...execution.executed);
    toolsDenied.push(...execution.denied);
    toolErrors.push(...execution.invalid, ...execution.missing, ...execution.failed, ...skippedCalls);

    const allResponses = [...execution.responses, ...skippedCalls];
    contents.push({
      role: 'user',
      parts: allResponses.map(buildFunctionResponsePart),
    });

    if (totalCalls >= maxCalls || round === maxRounds) {
      const finalResponse = await provider.generateFromContents({
        instructions: prompt.instructions,
        contents,
        maxOutputTokens: 900,
      });
      usage = mergeUsage(usage, finalResponse.usageMetadata);
      finalText = finalResponse.text;
      break;
    }
  }

  if (!finalText) throw new Error('Native function calling completed without a final answer');

  return {
    supported: true,
    answer: finalText,
    provider: provider.name,
    model: provider.model,
    callsRequested,
    toolsExecuted: [...new Set(toolsExecuted)],
    toolsDenied,
    toolErrors,
    rounds,
    usage,
    selectionStrategy: 'native_function_calling',
  };
}

export { runNativeFunctionCalling };

