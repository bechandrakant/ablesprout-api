import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { MockProvider } from './mock';
import { logger } from '../../config/logger';
import { LLMProvider } from './types';

let provider: LLMProvider | undefined;

export function getLLM(): LLMProvider {
  if (provider) return provider;
  if (env.LLM_PROVIDER === 'mock') {
    if (env.NODE_ENV === 'production') logger.warn('LLM_PROVIDER=mock: AI output is canned demo data, not real drafts');
    provider = new MockProvider();
  } else if (env.LLM_PROVIDER === 'openai') {
    if (!env.LLM_MODEL) throw new AppError(503, 'AI_UNAVAILABLE', 'LLM_MODEL must be set when LLM_PROVIDER=openai');
    provider = new OpenAIProvider(env.LLM_API_KEY, env.LLM_MODEL);
  } else {
    provider = new AnthropicProvider(env.LLM_API_KEY, env.LLM_MODEL || undefined);
  }
  return provider;
}

/** Test hook: inject a mock provider (pass undefined to reset). */
export function setLLM(p: LLMProvider | undefined) {
  provider = p;
}

export * from './types';
