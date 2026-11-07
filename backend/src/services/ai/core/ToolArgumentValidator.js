function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateValue(schema = {}, value, path, errors) {
  const type = String(schema.type || '').toLowerCase();

  if (value === undefined || value === null) {
    if (schema.nullable) return value;
    return value;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of: ${schema.enum.join(', ')}`);
    return value;
  }

  if (type === 'object') {
    if (!isPlainObject(value)) {
      errors.push(`${path} must be an object`);
      return {};
    }

    const properties = schema.properties || {};
    const required = new Set(schema.required || []);
    const output = {};

    for (const key of required) {
      if (value[key] === undefined || value[key] === null || value[key] === '') {
        errors.push(`${path}.${key} is required`);
      }
    }

    for (const [key, childValue] of Object.entries(value)) {
      const childSchema = properties[key];
      if (!childSchema) {
        if (schema.additionalProperties === true) output[key] = childValue;
        else errors.push(`${path}.${key} is not allowed`);
        continue;
      }
      output[key] = validateValue(childSchema, childValue, `${path}.${key}`, errors);
    }

    return output;
  }

  if (type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array`);
      return [];
    }
    if (Number.isFinite(schema.maxItems) && value.length > schema.maxItems) {
      errors.push(`${path} must contain at most ${schema.maxItems} items`);
    }
    return value.map((item, index) => validateValue(schema.items || {}, item, `${path}[${index}]`, errors));
  }

  if (type === 'string') {
    if (typeof value !== 'string') {
      errors.push(`${path} must be a string`);
      return String(value);
    }
    const clean = value.trim();
    if (Number.isFinite(schema.maxLength) && clean.length > schema.maxLength) {
      errors.push(`${path} must be at most ${schema.maxLength} characters`);
    }
    return clean;
  }

  if (type === 'integer' || type === 'number') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || (type === 'integer' && !Number.isInteger(parsed))) {
      errors.push(`${path} must be ${type === 'integer' ? 'an integer' : 'a number'}`);
      return value;
    }
    if (Number.isFinite(schema.minimum) && parsed < schema.minimum) {
      errors.push(`${path} must be at least ${schema.minimum}`);
    }
    if (Number.isFinite(schema.maximum) && parsed > schema.maximum) {
      errors.push(`${path} must be at most ${schema.maximum}`);
    }
    return parsed;
  }

  if (type === 'boolean') {
    if (typeof value !== 'boolean') errors.push(`${path} must be a boolean`);
    return Boolean(value);
  }

  return value;
}

function validateToolArguments(schema, args) {
  const normalizedSchema = schema || { type: 'object', properties: {}, additionalProperties: false };
  const errors = [];
  const value = validateValue(normalizedSchema, isPlainObject(args) ? args : {}, 'args', errors);
  return { valid: errors.length === 0, value, errors };
}

export { validateToolArguments };

