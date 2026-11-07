import { createTimeoutSignal, parseErrorResponse, cleanText } from './providerUtils.js';
class GeminiProvider {
  constructor() {
    this.name = 'gemini';
    this.apiKey = process.env.GEMINI_API_KEY;
    this.model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
    this.baseUrl = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  }

  isConfigured() {
    return Boolean(this.apiKey && this.model);
  }

  supportsFunctionCalling() {
    return true;
  }

  getStatus() {
    return {
      name: this.name,
      model: this.model,
      configured: this.isConfigured(),
      functionCalling: true,
    };
  }

  extractText(payload) {
    return (payload?.candidates || [])
      .flatMap((candidate) => candidate?.content?.parts || [])
      .map((part) => cleanText(part?.text))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  extractFunctionCalls(payload) {
    const parts = payload?.candidates?.[0]?.content?.parts || [];
    return parts
      .filter((part) => part?.functionCall?.name)
      .map((part, index) => ({
        id: part.functionCall.id || `${part.functionCall.name}-${index + 1}`,
        name: part.functionCall.name,
        args: part.functionCall.args && typeof part.functionCall.args === 'object'
          ? part.functionCall.args
          : {},
      }));
  }

  async request(body) {
    if (!this.isConfigured()) throw new Error('Gemini provider is not configured');
    const timeout = createTimeoutSignal(Number(process.env.AI_REQUEST_TIMEOUT_MS) || 30000);

    try {
      const response = await fetch(`${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify(body),
        signal: timeout.signal,
      });
      if (!response.ok) throw await parseErrorResponse(response, 'Gemini');
      return response.json();
    } finally {
      timeout.clear();
    }
  }

  async generateText({ instructions, input, maxOutputTokens = 500 }) {
    const payload = await this.request({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: 'user', parts: [{ text: input }] }],
      generationConfig: {
        maxOutputTokens,
        temperature: Number(process.env.AI_TEMPERATURE) || 0.65,
      },
    });

    const text = this.extractText(payload);
    if (!text) throw new Error('Gemini returned an empty response');
    return text;
  }

  async generateWithTools({
    instructions,
    contents,
    functionDeclarations,
    maxOutputTokens = 900,
    functionCallingMode = 'AUTO',
  }) {
    const declarations = Array.isArray(functionDeclarations) ? functionDeclarations : [];
    const body = {
      systemInstruction: { parts: [{ text: instructions }] },
      contents,
      generationConfig: {
        maxOutputTokens,
        temperature: Number(process.env.AI_TOOL_TEMPERATURE) || 0.2,
      },
    };

    if (declarations.length) {
      body.tools = [{ functionDeclarations: declarations }];
      body.toolConfig = {
        functionCallingConfig: {
          mode: functionCallingMode,
        },
      };
    }

    const payload = await this.request(body);
    const modelContent = payload?.candidates?.[0]?.content || { role: 'model', parts: [] };

    return {
      text: this.extractText(payload),
      calls: this.extractFunctionCalls(payload),
      modelContent,
      usageMetadata: payload?.usageMetadata || null,
      finishReason: payload?.candidates?.[0]?.finishReason || null,
    };
  }

  async generateFromContents({ instructions, contents, maxOutputTokens = 900 }) {
    const payload = await this.request({
      systemInstruction: { parts: [{ text: instructions }] },
      contents,
      generationConfig: {
        maxOutputTokens,
        temperature: Number(process.env.AI_TEMPERATURE) || 0.65,
      },
    });

    const text = this.extractText(payload);
    if (!text) throw new Error('Gemini returned an empty final response');
    return { text, usageMetadata: payload?.usageMetadata || null };
  }
}

export default GeminiProvider;