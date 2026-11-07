import { createTimeoutSignal, parseErrorResponse, cleanText } from './providerUtils.js';
class GroqProvider {
  constructor() {
    this.name = 'groq';
    this.apiKey = process.env.GROQ_API_KEY;
    this.model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
    this.baseUrl = (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  }

  isConfigured() {
    return Boolean(this.apiKey && this.model);
  }

  getStatus() {
    return { name: this.name, model: this.model, configured: this.isConfigured() };
  }

  async generateText({ instructions, input, maxOutputTokens = 500 }) {
    if (!this.isConfigured()) throw new Error('Groq provider is not configured');
    const timeout = createTimeoutSignal(Number(process.env.AI_REQUEST_TIMEOUT_MS) || 30000);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: instructions },
            { role: 'user', content: input },
          ],
          max_tokens: maxOutputTokens,
          temperature: Number(process.env.AI_TEMPERATURE) || 0.65,
        }),
        signal: timeout.signal,
      });
      if (!response.ok) throw await parseErrorResponse(response, 'Groq');
      const payload = await response.json();
      const text = cleanText(payload?.choices?.[0]?.message?.content);
      if (!text) throw new Error('Groq returned an empty response');
      return text;
    } finally {
      timeout.clear();
    }
  }
}

export default GroqProvider;