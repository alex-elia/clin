import { appendLlmCallLog } from "@/lib/llm/llmCallLog";
import { tavilyCreditCostEur } from "@/lib/llm/llmPricing";

/** Log billable non-chat tool usage (Tavily, etc.) into the same FinOps log. */
export async function logTavilySearchUsage(opts: {
  feature: string;
  creditsUsed: number;
  durationMs: number;
  queryChars: number;
  ok: boolean;
  error?: string;
}): Promise<void> {
  if (opts.creditsUsed <= 0 && opts.ok) return;
  await appendLlmCallLog({
    feature: opts.feature,
    provider: "tavily",
    model: "search",
    durationMs: opts.durationMs,
    ok: opts.ok,
    error: opts.error,
    systemChars: 0,
    userChars: opts.queryChars,
    responseChars: 0,
    creditsUsed: opts.creditsUsed,
    estimatedCostEur: tavilyCreditCostEur(opts.creditsUsed),
    billable: true,
    responseText: opts.ok
      ? `Tavily search (${opts.creditsUsed} credit(s))`
      : opts.error ?? "Tavily failed",
  });
}
