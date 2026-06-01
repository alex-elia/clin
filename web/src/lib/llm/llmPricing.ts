import type { LlmProvider } from "@/lib/llm/types";

/** EUR per 1M tokens (input / output). Order: more specific model id first. */
const MODEL_PRICING_EUR: {
  match: RegExp;
  inputPer1M: number;
  outputPer1M: number;
}[] = [
  { match: /gpt-oss-120b|gpt-oss/i, inputPer1M: 0.08, outputPer1M: 0.25 },
  { match: /mistral-large|mistral-large-latest/i, inputPer1M: 2.0, outputPer1M: 6.0 },
  { match: /mistral-small|mistral-small-latest/i, inputPer1M: 0.1, outputPer1M: 0.3 },
  { match: /llama-3\.3|llama3\.3/i, inputPer1M: 0.11, outputPer1M: 0.34 },
  { match: /qwen|deepseek/i, inputPer1M: 0.15, outputPer1M: 0.45 },
  { match: /gpt-4o-mini/i, inputPer1M: 0.15, outputPer1M: 0.6 },
  { match: /gpt-4o/i, inputPer1M: 2.5, outputPer1M: 10.0 },
];

const DEFAULT_CLOUD_EUR = { inputPer1M: 0.2, outputPer1M: 0.6 };

/** Tavily: order-of-magnitude; override with TAVILY_EUR_PER_CREDIT. */
export function tavilyCreditCostEur(credits: number): number {
  const per =
    Number(process.env.TAVILY_EUR_PER_CREDIT?.trim()) ||
    Number(process.env.TAVILY_USD_PER_CREDIT?.trim()) * 0.92 ||
    0.0075;
  return credits * per;
}

export function isCloudBillableProvider(provider: string): boolean {
  return provider === "openai_compatible" || provider === "tavily";
}

export function resolveModelPricingEur(model: string): {
  inputPer1M: number;
  outputPer1M: number;
} {
  const m = model.trim().toLowerCase();
  for (const row of MODEL_PRICING_EUR) {
    if (row.match.test(m)) {
      return { inputPer1M: row.inputPer1M, outputPer1M: row.outputPer1M };
    }
  }
  return DEFAULT_CLOUD_EUR;
}

/** ~4 chars per token heuristic when API omits usage. */
export function estimateTokensFromChars(chars: number): number {
  return Math.max(0, Math.ceil(chars / 4));
}

export function estimateCloudCostEur(opts: {
  provider: LlmProvider | string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number | null {
  if (!isCloudBillableProvider(opts.provider)) return null;
  const { inputPer1M, outputPer1M } = resolveModelPricingEur(opts.model);
  const inputCost = (opts.inputTokens / 1_000_000) * inputPer1M;
  const outputCost = (opts.outputTokens / 1_000_000) * outputPer1M;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

export function resolveUsageTokens(entry: {
  provider: string;
  systemChars: number;
  userChars: number;
  responseChars: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): { inputTokens: number; outputTokens: number; totalTokens: number } {
  if (
    entry.inputTokens != null &&
    entry.outputTokens != null &&
    entry.inputTokens + entry.outputTokens > 0
  ) {
    return {
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      totalTokens: entry.inputTokens + entry.outputTokens,
    };
  }
  if (entry.totalTokens != null && entry.totalTokens > 0) {
    const input = estimateTokensFromChars(entry.systemChars + entry.userChars);
    const output = Math.max(0, entry.totalTokens - input);
    return {
      inputTokens: input,
      outputTokens: output,
      totalTokens: entry.totalTokens,
    };
  }
  const inputTokens = estimateTokensFromChars(
    entry.systemChars + entry.userChars,
  );
  const outputTokens = estimateTokensFromChars(entry.responseChars);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}
