const assert = require('node:assert/strict');

process.env.AI_PROVIDER = 'gemini';
process.env.GEMINI_API_KEY = 'test-key';
process.env.GEMINI_MODEL = 'gemini-3.1-flash-lite';
process.env.AI_MAX_TOOL_CALLS = '4';
process.env.AI_MAX_TOOL_ROUNDS = '2';

const requestBodies = [];
let requestNumber = 0;

global.fetch = async (_url, options) => {
  requestNumber += 1;
  const body = JSON.parse(options.body);
  requestBodies.push(body);

  if (requestNumber === 1) {
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          role: 'model',
          parts: [{
            functionCall: {
              id: 'call-1',
              name: 'smokeTool',
              args: { limit: 2 },
            },
            thoughtSignature: 'mock-signature',
          }],
        },
      }],
      usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 5, totalTokenCount: 25 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const functionResponse = body.contents
    .flatMap((content) => content.parts || [])
    .find((part) => part.functionResponse)?.functionResponse;

  assert.equal(functionResponse.id, 'call-1');
  assert.equal(functionResponse.name, 'smokeTool');
  assert.deepEqual(functionResponse.response.result, { rows: 2 });
  assert.equal(body.contents[1].parts[0].thoughtSignature, 'mock-signature');

  return new Response(JSON.stringify({
    candidates: [{ content: { role: 'model', parts: [{ text: 'Verified smoke-test answer.' }] } }],
    usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 8, totalTokenCount: 38 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const registry = require('../services/ai/core/ToolRegistry');
const { runNativeFunctionCalling } = require('../services/ai/assistant/NativeFunctionCalling.service');

registry.register({
  id: 'smokeTool',
  name: 'Smoke Tool',
  description: 'Returns a fixed number of verified smoke-test rows.',
  category: 'test',
  requiredPermissions: ['ai_smoke'],
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 5 },
    },
    required: ['limit'],
    additionalProperties: false,
  },
  async execute({ args }) {
    return { rows: args.limit };
  },
});

(async () => {
  const invalid = await registry.executeCalls(
    [{ id: 'invalid-1', name: 'smokeTool', args: { limit: 99, unexpected: true } }],
    {},
    new Set(['ai_smoke']),
  );
  assert.equal(invalid.invalid.length, 1);
  assert.equal(invalid.executed.length, 0);

  const result = await runNativeFunctionCalling({
    registry,
    permissions: new Set(['ai_smoke']),
    storeId: 'store-test',
    userId: 'user-test',
    message: 'Run the smoke tool.',
    lang: 'en',
    history: [],
  });

  assert.equal(result.supported, true);
  assert.equal(result.answer, 'Verified smoke-test answer.');
  assert.deepEqual(result.toolsExecuted, ['smokeTool']);
  assert.equal(result.callsRequested[0].id, 'call-1');
  assert.equal(result.selectionStrategy, 'native_function_calling');
  assert.equal(result.usage.totalTokens, 63);
  assert.equal(requestBodies.length, 2);

  console.log('AI function-calling smoke test passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
