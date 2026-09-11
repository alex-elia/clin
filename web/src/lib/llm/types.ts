export type LlmProvider = "ollama" | "openai_compatible";

export type LlmConfig = {
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
};

export type LlmUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type ChatCompletionResult = {
  text: string;
  usage?: LlmUsage;
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
  /** Cap completion length (OpenAI max_tokens / Ollama num_predict). */
  maxTokens?: number;
  /** When jsonMode is set, ask for this schema (OVH json_schema). Falls back to json_object. */
  jsonSchema?: {
    name: string;
    schema: Record<string, unknown>;
  };
  /** Ollama only: cap context window to limit RAM (default set per call site). */
  numCtx?: number;
  meta?: Record<string, string | number | boolean | null>;
};
