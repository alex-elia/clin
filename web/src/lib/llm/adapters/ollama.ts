import {
  emptyResponseError,
  formatOllamaModelError,
} from "@/lib/llm/errors";
import type { CompleteChatParams } from "@/lib/llm/types";

export async function completeChatOllama(
  params: CompleteChatParams,
): Promise<string> {
  const { config, system, user, jsonMode, temperature, timeoutMs } = params;
  const timeout = timeoutMs ?? (jsonMode ? 120_000 : 90_000);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    const body: Record<string, unknown> = {
      model: config.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      stream: false,
      options: { temperature: temperature ?? (jsonMode ? 0.35 : 0.55) },
    };
    if (jsonMode) body.format = "json";

    const res = await fetch(`${config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(formatOllamaModelError(res.status, errText, config.model));
    }
    const data = (await res.json()) as { message?: { content?: string } };
    const content = data.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error(emptyResponseError(config));
    }
    return jsonMode ? content : content.trim();
  } finally {
    clearTimeout(t);
  }
}
