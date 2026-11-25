import { ZodSchema } from 'zod';
import { getLLM, LLMRequest } from './llm';
import { logger } from '../config/logger';
import { AppError } from '../utils/errors';

/** Pulls the JSON object out of a model reply, tolerating stray code fences or prose. */
export function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new SyntaxError('No JSON object found in model output');
  }
}

/**
 * Calls the configured LLM, parses JSON and validates it against `schema`.
 * On invalid JSON / schema mismatch it retries exactly once, telling the model what was wrong.
 * Token usage is logged for every attempt.
 */
export async function generateJSON<T>(opts: {
  task: string;
  system: string;
  prompt: string;
  schema: ZodSchema<T>;
  context?: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const llm = getLLM();
  const messages: LLMRequest['messages'] = [{ role: 'user', content: opts.prompt }];
  let lastError = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    const res = await llm.complete({ system: opts.system, messages, maxTokens: opts.maxTokens });
    logger.info(
      {
        ai: {
          task: opts.task,
          provider: llm.name,
          model: res.model,
          attempt,
          inputTokens: res.usage.inputTokens,
          outputTokens: res.usage.outputTokens,
          totalTokens: res.usage.inputTokens + res.usage.outputTokens,
          ms: Date.now() - started,
        },
        ...opts.context,
      },
      'LLM token usage',
    );

    try {
      const parsed = opts.schema.safeParse(extractJson(res.text));
      if (parsed.success) return parsed.data;
      lastError = parsed.error.issues
        .slice(0, 10)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
    } catch (err) {
      lastError = `Invalid JSON: ${(err as Error).message}`;
    }

    logger.warn({ task: opts.task, attempt, lastError }, 'LLM output failed validation');
    messages.push(
      { role: 'assistant', content: res.text || '(empty response)' },
      {
        role: 'user',
        content: `Your previous reply was not valid for the required schema: ${lastError}. Reply again with only the corrected JSON object, no other text.`,
      },
    );
  }

  throw new AppError(502, 'AI_INVALID_OUTPUT', 'The AI returned an invalid response. Please try again.');
}
