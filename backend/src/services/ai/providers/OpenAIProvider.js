import { createTimeoutSignal, parseErrorResponse, cleanText } from './providerUtils.js';
class OpenAIProvider {
  constructor() {
    this.name = 'openai';
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL || 'gpt-5-mini';
    this.baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  }

  isConfigured() {
    return Boolean(this.apiKey && this.model);
  }

  getStatus() {
    return { name: this.name, model: this.model, configured: this.isConfigured() };
  }

  extractText(payload) {
    if (cleanText(payload?.output_text)) return cleanText(payload.output_text);
    const parts = [];
    for (const item of payload?.output || []) {
      for (const content of item?.content || []) {
        if (content?.type === 'output_text' && cleanText(content.text)) parts.push(cleanText(content.text));
      }
    }
    return parts.join('\n').trim();
  }

  async generateText({ instructions, input, maxOutputTokens = 500 }) {
    if (!this.isConfigured()) throw new Error('OpenAI provider is not configured');
    const timeout = createTimeoutSignal(Number(process.env.AI_REQUEST_TIMEOUT_MS) || 30000);
    try {
      const response = await fetch(`${this.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          instructions,
          input,
          max_output_tokens: maxOutputTokens,
        }),
        signal: timeout.signal,
      });
      if (!response.ok) throw await parseErrorResponse(response, 'OpenAI');
      const text = this.extractText(await response.json());
      if (!text) throw new Error('OpenAI returned an empty response');
      return text;
    } finally {
      timeout.clear();
    }
  }
}

export default OpenAIProvider;