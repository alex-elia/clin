/**
 * @deprecated Use `@/lib/llm/completeChat` and `getLlmConfig` from `@/lib/llm/config`.
 * Re-exports preserved for gradual migration.
 */
import {
  getLlmConfig,
  listOllamaModels,
  updateLlmConfig,
  LLM_KEYS,
} from "@/lib/llm/config";

/** @deprecated Use LLM_KEYS.ollamaBaseUrl / ollamaModel */
export const OLLAMA_KEYS = {
  baseUrl: LLM_KEYS.ollamaBaseUrl,
  model: LLM_KEYS.ollamaModel,
} as const;

export { listOllamaModels };

export type OllamaSettings = {
  baseUrl: string;
  model: string;
};

export async function getOllamaSettings(): Promise<OllamaSettings> {
  const c = await getLlmConfig();
  return { baseUrl: c.baseUrl, model: c.model };
}

export type OllamaSettingsPatch = Partial<{ baseUrl: string; model: string }>;

export async function updateOllamaSettings(
  patch: OllamaSettingsPatch,
): Promise<OllamaSettings> {
  const c = await updateLlmConfig({
    provider: "ollama",
    ollamaBaseUrl: patch.baseUrl,
    ollamaModel: patch.model,
  });
  return { baseUrl: c.baseUrl, model: c.model };
}
