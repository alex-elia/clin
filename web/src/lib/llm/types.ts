export type LlmProvider = "ollama" | "openai_compatible";

export type LlmConfig = {
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
};

export type CompleteChatParams = {
  config: LlmConfig;
  system: string;
  user: string;
  /** Label for AI call log (e.g. brand_coach, copy_assistant). */
  feature?: string;
  jsonMode?: boolean;
  temperature?: number;
  timeoutMs?: number;
  meta?: Record<string, string | number | boolean | null>;
};
