export interface LLMRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens?: number;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMResponse {
  text: string;
  model: string;
  usage: LLMUsage;
}

/** Provider-agnostic interface. Swap implementations via LLM_PROVIDER, or inject a mock in tests. */
export interface LLMProvider {
  readonly name: string;
  complete(req: LLMRequest): Promise<LLMResponse>;
}
