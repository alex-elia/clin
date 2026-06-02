import type { AppEvent } from "@/lib/telemetry/appEventLog";
import { getTelemetryCloudConfig } from "@/lib/telemetry/cloudConfig";
import type { LlmCallLogEntry } from "@/lib/llm/llmCallLog";

/** Meta keys never sent to cloud (PII / low-value identifiers). */
const BLOCKED_META_KEYS = new Set([
  "contactId",
  "memberId",
  "fullName",
  "draft",
  "responsePreview",
  "userChars",
  "systemChars",
  "responseChars",
]);

const ALLOWED_META_KEYS = new Set([
  "pageType",
  "mode",
  "limit",
  "runActions",
  "orchestrationId",
  "orchestration",
  "campaignId",
]);

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function sanitizeMeta(
  meta?: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean> | undefined {
  if (!meta) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (BLOCKED_META_KEYS.has(key)) continue;
    if (!ALLOWED_META_KEYS.has(key)) continue;
    if (value == null) continue;
    if (typeof value === "boolean" || typeof value === "number") {
      out[key] = value;
    } else {
      out[key] = truncate(String(value), 120);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export type CloudTelemetryRow = {
  id: string;
  instance_id: string;
  at: string;
  source: "app" | "llm";
  kind: string | null;
  action: string | null;
  feature: string | null;
  ok: boolean;
  duration_ms: number | null;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_eur: number | null;
  error: string | null;
  meta: Record<string, string | number | boolean> | null;
};

export function appEventToCloudRow(
  event: AppEvent,
  instanceId: string,
): CloudTelemetryRow {
  return {
    id: event.id,
    instance_id: instanceId,
    at: event.at,
    source: "app",
    kind: event.kind,
    action: event.action,
    feature: null,
    ok: event.ok,
    duration_ms: event.durationMs ?? null,
    provider: null,
    model: null,
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    estimated_cost_eur: null,
    error: event.error ? truncate(event.error, 180) : null,
    meta: sanitizeMeta(event.meta) ?? null,
  };
}

export function llmCallToCloudRow(
  entry: LlmCallLogEntry,
  instanceId: string,
): CloudTelemetryRow {
  return {
    id: entry.id,
    instance_id: instanceId,
    at: entry.at,
    source: "llm",
    kind: null,
    action: null,
    feature: entry.feature,
    ok: entry.ok,
    duration_ms: entry.durationMs,
    provider: entry.provider,
    model: entry.model,
    input_tokens: entry.inputTokens ?? null,
    output_tokens: entry.outputTokens ?? null,
    total_tokens: entry.totalTokens ?? null,
    estimated_cost_eur: entry.estimatedCostEur ?? null,
    error: entry.error ? truncate(entry.error, 180) : null,
    meta: sanitizeMeta(entry.meta) ?? null,
  };
}

/** Best-effort push to Edge Function; never throws. Local JSONL remains source of truth. */
export async function pushTelemetryToCloud(row: CloudTelemetryRow): Promise<void> {
  const cfg = await getTelemetryCloudConfig();
  if (!cfg) return;

  try {
    const res = await fetch(cfg.ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Clin-Telemetry-Secret": cfg.ingestSecret,
      },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok && process.env.CLIN_TELEMETRY_DEBUG === "1") {
      const body = await res.text().catch(() => "");
      console.warn(
        `[clin:telemetry] cloud push failed ${res.status}: ${body.slice(0, 200)}`,
      );
    }
  } catch (e) {
    if (process.env.CLIN_TELEMETRY_DEBUG === "1") {
      console.warn("[clin:telemetry] cloud push error:", e);
    }
  }
}

export function pushTelemetryToCloudAsync(row: CloudTelemetryRow): void {
  void pushTelemetryToCloud(row).catch(() => {
    /* ignore */
  });
}
