import {
  emptyResponseError,
  formatLlmChatError,
  parseHttpErrorBody,
} from "@/lib/llm/errors";
import { resolveOvhChatCompletionsUrl } from "@/lib/llm/ovhEnv";
import type {
  ChatCompletionResult,
  CompleteChatParams,
  LlmConfig,
} from "@/lib/llm/types";

export { resolveChatCompletionsUrl } from "@/lib/llm/chatCompletionsUrl";

function responseLooksLikeJsonObject(text: string): boolean {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  if (start === -1) return false;
  try {
    const parsed: unknown = JSON.parse(trimmed.slice(start));
    return parsed !== null && typeof parsed === "object";
  } catch {
    return false;
  }
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
  const contentText = typeof content === "string" ? content : String(content ?? "");
  const reasoningRaw = message.reasoning ?? message.reasoning_content;
  const reasoningText =
    reasoningRaw == null
      ? ""
      : typeof reasoningRaw === "string"
        ? reasoningRaw
        : String(reasoningRaw);
  if (responseLooksLikeJsonObject(contentText)) return contentText;
  if (responseLooksLikeJsonObject(reasoningText)) return reasoningText;
  if (contentText.trim()) return contentText;
  return reasoningText;
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

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableCloudStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

type ChatResponse = {
  choices?: { message?: Record<string, unknown> }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
};

async function postChatCompletionOnce(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
  config: LlmConfig,
): Promise<ChatCompletionResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const err = new Error(formatLlmChatError(config, res.status, errText));
    (err as Error & { httpStatus?: number }).httpStatus = res.status;
    throw err;
  }
  const data = (await res.json()) as ChatResponse;
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
  const usage = data.usage
    ? {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      }
    : undefined;
  return { text: content, usage };
}

async function postChatCompletionWithTimeout(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  config: LlmConfig,
  timeoutMs: number,
): Promise<ChatCompletionResult> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await postChatCompletionOnce(
      url,
      apiKey,
      body,
      controller.signal,
      config,
    );
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        `LLM (${config.provider}) timed out after ${Math.round(timeoutMs / 1000)}s.`,
      );
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function isTimeoutError(err: Error): boolean {
  return (
    err.name === "AbortError" || /timed out after/i.test(err.message)
  );
}

export async function completeChatOpenAiCompatible(
  params: CompleteChatParams,
): Promise<ChatCompletionResult> {
  const {
    config,
    system,
    user,
    jsonMode,
    jsonSchema,
    temperature,
    timeoutMs,
    maxTokens,
  } = params;
  const apiKey = assertApiKey(config);
  const url = resolveOvhChatCompletionsUrl({ baseUrl: config.baseUrl });
  const timeout = timeoutMs ?? (jsonMode ? 240_000 : 120_000);
  const qwenNoThink =
    /qwen/i.test(config.model) && Boolean(jsonMode)
      ? `${user.trim()}\n\n/no_think`
      : user;

  const buildBody = (opts: {
    useJsonMode: boolean;
    useSchema: boolean;
  }): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      model: config.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: opts.useJsonMode ? qwenNoThink : user },
      ],
      temperature: temperature ?? (opts.useJsonMode ? 0.35 : 0.55),
      max_tokens: maxTokens ?? (opts.useJsonMode ? 8192 : 2048),
    };
    if (opts.useJsonMode && opts.useSchema && jsonSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: jsonSchema.name,
          strict: true,
          schema: jsonSchema.schema,
        },
      };
    } else if (opts.useJsonMode) {
      body.response_format = { type: "json_object" };
    }
    return body;
  };

  const attempts: { useJsonMode: boolean; useSchema: boolean }[] = jsonMode
    ? [
        ...(jsonSchema
          ? [{ useJsonMode: true, useSchema: true }]
          : []),
        { useJsonMode: true, useSchema: false },
        { useJsonMode: false, useSchema: false },
      ]
    : [{ useJsonMode: false, useSchema: false }];

  let lastError: Error | null = null;

  for (const attempt of attempts) {
    for (let retry = 0; retry < 3; retry += 1) {
      try {
        const result = await postChatCompletionWithTimeout(
          url,
          apiKey,
          buildBody(attempt),
          config,
          timeout,
        );
        const text = attempt.useJsonMode ? result.text : result.text.trim();
        if (
          attempt.useJsonMode &&
          jsonMode &&
          !responseLooksLikeJsonObject(text)
        ) {
          lastError = new Error("Model returned no JSON object.");
          break;
        }
        return { text, usage: result.usage };
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        lastError = err;
        if (isTimeoutError(err)) {
          throw err;
        }
        const status = (err as Error & { httpStatus?: number }).httpStatus;
        if (
          typeof status === "number" &&
          isRetryableCloudStatus(status) &&
          retry < 2
        ) {
          await sleepMs(600 * (retry + 1) * (retry + 1));
          continue;
        }
        break;
      }
    }
  }
  throw lastError ?? new Error("Cloud inference failed.");
}
