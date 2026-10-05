import env from '../config/env.js';
import logger from '../config/logger.js';
import { AppError } from '../middleware/error.js';

/**
 * Minimal Groq client (OpenAI-compatible Chat Completions API) using the
 * built-in fetch - no SDK needed. Returns parsed JSON when json=true.
 */
export async function groqChat({ messages, model = env.GROQ_MODEL, json = true, temperature = 0.1, maxTokens = 1024, timeoutMs = env.GROQ_TIMEOUT_MS }) {
  if (!env.GROQ_API_KEY) throw new AppError(503, 'AI is not configured on the server', { code: 'AI_DISABLED' });

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  };

  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    let res;
    try {
      res = await fetch(`${env.GROQ_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      lastErr = new AppError(504, 'AI service timed out', { code: 'AI_TIMEOUT' });
      logger.warn({ err: err.message, attempt }, 'groq request failed');
      continue;
    }

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      logger.debug({ model, ms: Date.now() - started, usage: data.usage }, 'groq ok');
      if (!json) return content;
      try {
        return JSON.parse(content);
      } catch {
        // Some models wrap JSON in prose/code fences - pull out the object.
        const m = content.match(/\{[\s\S]*\}/);
        if (m) return JSON.parse(m[0]);
        throw new AppError(502, 'AI returned an unreadable response', { code: 'AI_BAD_RESPONSE' });
      }
    }

    const errText = await res.text().catch(() => '');
    logger.warn({ status: res.status, body: errText.slice(0, 300), attempt }, 'groq error response');
    if (res.status === 401) throw new AppError(502, 'AI key is invalid - check GROQ_API_KEY', { code: 'AI_AUTH' });
    if (res.status === 429) {
      lastErr = new AppError(429, 'AI is busy right now, try again in a moment', { code: 'AI_RATE_LIMIT' });
      await new Promise((r) => setTimeout(r, 600));
      continue;
    }
    if (res.status >= 500) {
      lastErr = new AppError(502, 'AI service error', { code: 'AI_UPSTREAM' });
      continue;
    }
    throw new AppError(502, `AI request rejected (${res.status})`, { code: 'AI_REJECTED' });
  }
  throw lastErr;
}
