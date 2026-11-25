import OpenAI from 'openai';
import { LLMProvider, LLMRequest, LLMResponse } from './types';
import { AppError } from '../../utils/errors';
import { logger } from '../../config/logger';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private client: OpenAI;

  constructor(
    apiKey: string | undefined,
    private model: string,
  ) {
    this.client = new OpenAI(apiKey ? { apiKey } : {});
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    try {
      const res = await this.client.chat.completions.create({
        model: this.model,
        max_completion_tokens: req.maxTokens ?? 16000,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: req.system }, ...req.messages],
      });
      return {
        text: res.choices[0]?.message?.content ?? '',
        model: res.model,
        usage: { inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0 },
      };
    } catch (err) {
      if (err instanceof OpenAI.APIError) throw new AppError(502, 'AI_ERROR', `AI service error (${err.status ?? 'network'})`);
      // e.g. no credentials configured, network failure before a response
      logger.error({ err }, 'OpenAI provider call failed');
      throw new AppError(503, 'AI_UNAVAILABLE', 'AI service is not available. Check LLM configuration.');
    }
  }
}
