import type { LlmConfig } from "@/lib/llm/types";

export function parseHttpErrorBody(bodyText: string): string {
  const trimmed = bodyText.trim();
  let detail = trimmed.slice(0, 500) || "request failed";
  try {
    const j = JSON.parse(trimmed) as { error?: string | { message?: string } };
    if (typeof j.error === "string" && j.error) detail = j.error;
    else if (
      j.error &&
      typeof j.error === "object" &&
      typeof j.error.message === "string"
    ) {
      detail = j.error.message;
    }
  } catch {
    /* keep raw */
  }
  return detail;
}

/** Ollama-specific hints when the model tag is missing. */
export function formatOllamaModelError(
  status: number,
  bodyText: string,
  model: string,
): string {
  const detail = parseHttpErrorBody(bodyText) || `HTTP ${status}`;
  let out = `Local inference HTTP ${status}: ${detail}`;
  const looksMissingModel =
    status === 404 ||
    /not found|unknown model|model.*not found|does not exist/i.test(detail);
  if (looksMissingModel) {
    out += `\n\nFix: open a terminal and run: ollama pull ${model}`;
    out += `\nOr in Clin → Settings, set “Model name” to an installed tag (run ollama list — names must match exactly, e.g. qwen2.5:7b vs qwen2.5:8b).`;
  }
  return out;
}

export function formatLlmChatError(
  config: LlmConfig,
  status: number,
  bodyText: string,
): string {
  if (config.provider === "ollama") {
    return formatOllamaModelError(status, bodyText, config.model);
  }
  const detail = parseHttpErrorBody(bodyText) || `HTTP ${status}`;
  return `Cloud inference HTTP ${status}: ${detail}`;
}

export function emptyResponseError(config: LlmConfig): string {
  return config.provider === "ollama"
    ? "Local inference returned empty message content."
    : "Cloud inference returned empty message content.";
}
