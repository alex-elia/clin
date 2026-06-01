import { completeChatOllama } from "@/lib/llm/adapters/ollama";
import { completeChatOpenAiCompatible } from "@/lib/llm/adapters/openaiCompatible";
import { appendLlmCallLog } from "@/lib/llm/llmCallLog";
import { estimateCloudCostEur, resolveUsageTokens } from "@/lib/llm/llmPricing";
import type { CompleteChatParams } from "@/lib/llm/types";

export type { CompleteChatParams, LlmConfig, LlmProvider } from "@/lib/llm/types";
export {
  getLlmConfig,
  getLlmConfigPublic,
  hasEnvCloudCredentials,
  hasEnvLocalFile,
  seedLlmSettingsFromEnvOnce,
  updateLlmConfig,
  listOllamaModels,
  probeLlmConnection,
} from "@/lib/llm/config";
export type { LlmConfigPublic } from "@/lib/llm/config";

/**
 * Unified chat completion for all Clin LLM features (ADR-0005).
 * Routes to provider adapters; features must not call Ollama HTTP directly.
 */
export async function completeChat(params: CompleteChatParams): Promise<string> {
  const started = Date.now();
  const feature = params.feature ?? "llm";
  const base = {
    feature,
    provider: params.config.provider,
    model: params.config.model,
    systemChars: params.system.length,
    userChars: params.user.length,
    meta: params.meta,
  };

  try {
    let result: Awaited<ReturnType<typeof completeChatOllama>>;
    switch (params.config.provider) {
      case "ollama":
        result = await completeChatOllama(params);
        break;
      case "openai_compatible":
        result = await completeChatOpenAiCompatible(params);
        break;
      default: {
        const _exhaustive: never = params.config.provider;
        throw new Error(`Unknown provider: ${_exhaustive}`);
      }
    }
    const { text, usage } = result;
    const tokenRow = resolveUsageTokens({
      provider: params.config.provider,
      systemChars: base.systemChars,
      userChars: base.userChars,
      responseChars: text.length,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      totalTokens: usage?.totalTokens,
    });
    const estimatedCostEur =
      params.config.provider === "openai_compatible"
        ? estimateCloudCostEur({
            provider: params.config.provider,
            model: params.config.model,
            inputTokens: tokenRow.inputTokens,
            outputTokens: tokenRow.outputTokens,
          })
        : null;
    await appendLlmCallLog({
      ...base,
      durationMs: Date.now() - started,
      ok: true,
      responseChars: text.length,
      responseText: text,
      inputTokens: tokenRow.inputTokens,
      outputTokens: tokenRow.outputTokens,
      totalTokens: tokenRow.totalTokens,
      estimatedCostEur: estimatedCostEur ?? undefined,
      billable: params.config.provider === "openai_compatible",
    });
    return text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await appendLlmCallLog({
      ...base,
      durationMs: Date.now() - started,
      ok: false,
      error: msg,
      responseChars: 0,
      responseText: msg,
    });
    throw e;
  }
}
