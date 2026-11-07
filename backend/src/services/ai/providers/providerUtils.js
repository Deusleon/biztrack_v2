function createTimeoutSignal(timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

async function parseErrorResponse(response, providerName) {
  const body = await response.text();
  const compactBody = body.replace(/\s+/g, ' ').slice(0, 500);
  return new Error(`${providerName} request failed (${response.status}): ${compactBody}`);
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export { createTimeoutSignal, parseErrorResponse, cleanText };

