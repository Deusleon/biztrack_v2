// Gemini's function schema is a small subset of JSON Schema. Fields such as
// additionalProperties, minimum and maximum make the request fail with HTTP 400.
const ALLOWED = new Set([
  'type', 'format', 'description', 'nullable', 'enum', 'maxItems', 'minItems',
  'properties', 'required', 'items', 'anyOf', 'propertyOrdering',
]);

function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { type: 'object', properties: {} };
  }
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!ALLOWED.has(key)) continue;
    if (key === 'properties' && value && typeof value === 'object') {
      out.properties = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, toGeminiSchema(child)]),
      );
    } else if (key === 'items') {
      out.items = toGeminiSchema(value);
    } else if (key === 'anyOf' && Array.isArray(value)) {
      out.anyOf = value.map((child) => toGeminiSchema(child));
    } else {
      out[key] = value;
    }
  }
  if (!out.type) out.type = 'object';
  return out;
}

function toGeminiDeclarations(declarations) {
  return (Array.isArray(declarations) ? declarations : []).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: toGeminiSchema(tool.parameters),
  }));
}

export { toGeminiSchema, toGeminiDeclarations };
