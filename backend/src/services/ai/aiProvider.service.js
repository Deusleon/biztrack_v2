import { createProvider, getProviderStatus } from './AIProviderFactory.js';
async function generateText({ instructions, input, maxOutputTokens = 500 }) {
  const provider = createProvider();
  if (!provider.isConfigured()) {
    return {
      text: null,
      provider: provider.name,
      model: provider.model,
      configured: false,
      error: `${provider.name} provider is not configured`,
    };
  }

  try {
    const text = await provider.generateText({ instructions, input, maxOutputTokens });
    return {
      text,
      provider: provider.name,
      model: provider.model,
      configured: true,
      error: null,
    };
  } catch (error) {
    return {
      text: null,
      provider: provider.name,
      model: provider.model,
      configured: true,
      error: error.message,
    };
  }
}

export { generateText, getProviderStatus };

