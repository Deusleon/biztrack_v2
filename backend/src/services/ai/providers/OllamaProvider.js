import { createTimeoutSignal, parseErrorResponse, cleanText } from './providerUtils.js';
class OllamaProvider {
  constructor() {
    this.name = 'ollama';
    this.model = process.env.OLLAMA_MODEL || 'qwen3:4b';
    this.baseUrl = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
  }

  isConfigured() {
    return Boolean(this.model && this.baseUrl);
  }

  getStatus() {
    return { name: this.name, model: this.model, configured: this.isConfigured(), local: true };
  }

  async generateText({ instructions, input, maxOutputTokens = 500 }) {
    if (!this.isConfigured()) throw new Error('Ollama provider is not configured');
    const timeout = createTimeoutSignal(Number(process.env.AI_REQUEST_TIMEOUT_MS) || 60000);
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          system: instructions,
          prompt: input,
          stream: false,
          options: {
            temperature: Number(process.env.AI_TEMPERATURE) || 0.65,
            num_predict: maxOutputTokens,
          },
        }),
        signal: timeout.signal,
      });
      if (!response.ok) throw await parseErrorResponse(response, 'Ollama');
      const payload = await response.json();
      const text = cleanText(payload?.response);
      if (!text) throw new Error('Ollama returned an empty response');
      return text;
    } finally {
      timeout.clear();
    }
  }
}

export default OllamaProvider;