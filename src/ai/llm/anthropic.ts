import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMRequest, LLMResponse } from './types';
import { AppError } from '../../utils/errors';
import { logger } from '../../config/logger';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';
// Models that accept the server-side refusal fallback (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-2', 'claude-fable-5-1', 'claude-sonnet-5-5']);

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(
    apiKey: string | undefined,
    private model = DEFAULT_ANTHROPIC_MODEL,
  ) {
    // With no key the SDK falls back to ANTHROPIC_API_KEY / `ant auth login` credentials.
    this.client = new Anthropic(apiKey ? { apiKey } : {});
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const useFallbacks = FALLBACK_MODELS.has(this.model);
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 16000,
        system: req.system,
        messages: req.messages,
        output_config: { effort: 'medium' },
        ...(useFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) throw new AppError(503, 'AI_RATE_LIMITED', 'AI service is busy, try again shortly');
      if (err instanceof Anthropic.AuthenticationError) throw new AppError(503, 'AI_UNAVAILABLE', 'AI service is not configured');
      if (err instanceof Anthropic.APIError) throw new AppError(502, 'AI_ERROR', `AI service error (${err.status ?? 'network'})`);
      // e.g. no credentials configured, network failure before a response
      logger.error({ err }, 'Anthropic provider call failed');
      throw new AppError(503, 'AI_UNAVAILABLE', 'AI service is not available. Check LLM configuration.');
    }

    if (response.stop_reason === 'refusal') {
      throw new AppError(422, 'AI_REFUSED', 'The AI declined this request. Please rephrase or write it manually.');
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return {
      text,
      model: response.model,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  }
}
