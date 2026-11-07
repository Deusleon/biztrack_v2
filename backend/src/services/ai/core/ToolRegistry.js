import { hasRequiredPermissions } from './PermissionResolver.js';
import { validateToolArguments } from './ToolArgumentValidator.js';
const DEFAULT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {},
  additionalProperties: false,
});

function withTimeout(promise, timeoutMs, toolId) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`${toolId} exceeded ${timeoutMs}ms execution limit`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));
}

class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(tool) {
    if (!tool || !tool.id || typeof tool.execute !== 'function') throw new TypeError('Invalid AI tool');
    if (this.tools.has(tool.id)) throw new Error(`AI tool already registered: ${tool.id}`);

    this.tools.set(tool.id, Object.freeze({
      requiredPermissions: [],
      category: 'general',
      inputSchema: DEFAULT_SCHEMA,
      ...tool,
    }));
    return this;
  }

  get(id) {
    return this.tools.get(id);
  }

  list(permissionSet) {
    return [...this.tools.values()]
      .filter((tool) => !permissionSet || hasRequiredPermissions(permissionSet, tool.requiredPermissions))
      .map(({ id, name, description, category, requiredPermissions, inputSchema }) => ({
        id,
        name,
        description,
        category,
        requiredPermissions,
        inputSchema,
      }));
  }

  toFunctionDeclarations(permissionSet) {
    return this.list(permissionSet).map((tool) => ({
      name: tool.id,
      description: tool.description,
      parameters: tool.inputSchema || DEFAULT_SCHEMA,
    }));
  }

  async execute(ids, context, permissionSet) {
    const results = {};
    const executed = [];
    const denied = [];
    const missing = [];

    for (const id of [...new Set(ids)]) {
      const tool = this.get(id);
      if (!tool) {
        missing.push(id);
        continue;
      }
      if (!hasRequiredPermissions(permissionSet, tool.requiredPermissions)) {
        denied.push({ id, requiredPermissions: tool.requiredPermissions });
        continue;
      }
      results[id] = await tool.execute({ ...context, args: {} });
      executed.push(id);
    }

    return { results, executed, denied, missing };
  }

  async executeCalls(calls, context, permissionSet, options = {}) {
    const maxCalls = Math.max(Number(options.maxCalls) || 4, 1);
    const timeoutMs = Math.max(Number(options.timeoutMs) || 10000, 1000);
    const selected = Array.isArray(calls) ? calls.slice(0, maxCalls) : [];

    const responses = await Promise.all(selected.map(async (call, index) => {
      const name = String(call?.name || '').trim();
      const callId = String(call?.id || `${name || 'unknown'}-${index + 1}`);
      const args = call?.args && typeof call.args === 'object' ? call.args : {};
      const tool = this.get(name);

      if (!tool) {
        return { id: callId, name, args, status: 'missing', error: `Unknown tool: ${name}` };
      }

      if (!hasRequiredPermissions(permissionSet, tool.requiredPermissions)) {
        return {
          id: callId,
          name,
          args,
          status: 'denied',
          requiredPermissions: tool.requiredPermissions,
          error: 'Permission denied',
        };
      }

      const validation = validateToolArguments(tool.inputSchema, args);
      if (!validation.valid) {
        return {
          id: callId,
          name,
          args,
          status: 'invalid_arguments',
          validationErrors: validation.errors,
          error: validation.errors.join('; '),
        };
      }

      try {
        const result = await withTimeout(
          Promise.resolve(tool.execute({ ...context, args: validation.value })),
          timeoutMs,
          name,
        );
        return { id: callId, name, args: validation.value, status: 'success', result };
      } catch (error) {
        return { id: callId, name, args: validation.value, status: 'error', error: error.message };
      }
    }));

    return {
      responses,
      executed: responses.filter((item) => item.status === 'success').map((item) => item.name),
      denied: responses.filter((item) => item.status === 'denied'),
      invalid: responses.filter((item) => item.status === 'invalid_arguments'),
      missing: responses.filter((item) => item.status === 'missing'),
      failed: responses.filter((item) => item.status === 'error'),
      truncated: Array.isArray(calls) && calls.length > selected.length,
    };
  }
}

export default new ToolRegistry();