import {
  emptyResponseError,
  formatLlmChatError,
  parseHttpErrorBody,
} from "@/lib/llm/errors";
import { resolveOvhChatCompletionsUrl } from "@/lib/llm/ovhEnv";
import type { CompleteChatParams, LlmConfig } from "@/lib/llm/types";

/** Resolve OpenAI-style chat completions URL from a configured API root. */
export function resolveChatCompletionsUrl(baseUrl: string): string {
  const root = baseUrl.replace(/\/$/, "");
  if (/\/chat\/completions$/i.test(root)) return root;
  if (/\/v1$/i.test(root)) return `${root}/chat/completions`;
  if (/openai_compat\/.+\/chat\/completions$/i.test(root)) return root;
  if (/openai_compat|\/api\//i.test(root)) {
    return `${root}/chat/completions`;
  }
  return `${root}/v1/chat/completions`;
}

function extractMessageContent(message: Record<string, unknown>): string {
  let content: unknown = message.content ?? "";
  if (Array.isArray(content)) {
    content = content
      .map((c) =>
        typeof c === "string"
          ? c
          : c && typeof c === "object" && "text" in c
            ? String((c as { text?: string }).text ?? "")
            : "",
      )
      .join("");
  } else if (typeof content !== "string") {
    content = String(content ?? "");
  }
  if (!content && (message.reasoning != null || message.reasoning_content != null)) {
    const reasoning = message.reasoning ?? message.reasoning_content;
    content = typeof reasoning === "string" ? reasoning : String(reasoning ?? "");
  }
  return typeof content === "string" ? content : String(content ?? "");
}

function assertApiKey(config: LlmConfig): string {
  const key = config.apiKey?.trim();
  if (!key) {
    throw new Error(
      "Cloud LLM API key is missing. Add it in Settings → Inference, or set LLM_API_KEY / OVH_AI_ENDPOINTS_ACCESS_TOKEN in .env.local.",
    );
  }
  return key;
}

export async function completeChatOpenAiCompatible(
  params: CompleteChatParams,
): Promise<string> {
  const { config, system, user, jsonMode, temperature, timeoutMs } = params;
  const apiKey = assertApiKey(config);
  const url = resolveOvhChatCompletionsUrl({ baseUrl: config.baseUrl });
  const timeout = timeoutMs ?? (jsonMode ? 180_000 : 120_000);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);

  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: temperature ?? (jsonMode ? 0.35 : 0.55),
    max_tokens: jsonMode ? 4096 : 2048,
  };
  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(formatLlmChatError(config, res.status, errText));
    }
    const data = (await res.json()) as {
      choices?: { message?: Record<string, unknown> }[];
      error?: { message?: string };
    };
    if (data.error?.message) {
      throw new Error(
        `LLM (${config.provider}): ${parseHttpErrorBody(JSON.stringify(data.error))}`,
      );
    }
    const msg = data.choices?.[0]?.message;
    if (!msg) {
      throw new Error(emptyResponseError(config));
    }
    const content = extractMessageContent(msg);
    if (!content.trim()) {
      throw new Error(emptyResponseError(config));
    }
    return jsonMode ? content : content.trim();
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        `LLM (${config.provider}) timed out after ${Math.round(timeout / 1000)}s.`,
      );
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}
