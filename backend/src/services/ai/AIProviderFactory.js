import OpenAIProvider from './providers/OpenAIProvider.js';
import GeminiProvider from './providers/GeminiProvider.js';
import GroqProvider from './providers/GroqProvider.js';
import OllamaProvider from './providers/OllamaProvider.js';
const PROVIDERS = {
  openai: OpenAIProvider,
  gemini: GeminiProvider,
  groq: GroqProvider,
  ollama: OllamaProvider,
};

function normalizeProviderName(value) {
  return String(value || 'gemini').trim().toLowerCase();
}

function createProvider() {
  const requestedName = normalizeProviderName(process.env.AI_PROVIDER);
  const ProviderClass = PROVIDERS[requestedName];
  if (!ProviderClass) {
    throw new Error(`Unsupported AI_PROVIDER "${requestedName}". Supported providers: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return new ProviderClass();
}

function getProviderStatus() {
  try {
    const provider = createProvider();
    return { requested: provider.name, ...provider.getStatus(), error: null };
  } catch (error) {
    return {
      requested: normalizeProviderName(process.env.AI_PROVIDER),
      name: null,
      model: null,
      configured: false,
      error: error.message,
    };
  }
}

export { createProvider, getProviderStatus, normalizeProviderName };

