import { listAllAppEvents, type AppEvent } from "@/lib/telemetry/appEventLog";
import { getTelemetryCloudStatus } from "@/lib/telemetry/cloudConfig";
import { listAllLlmCallLogs, type LlmCallLogEntry } from "@/lib/llm/llmCallLog";
import { FINOPS_FEATURE_LABELS } from "@/lib/llm/llmFinOps";

export const TELEMETRY_ACTION_LABELS: Record<string, string> = {
  capture_ingest: "Profile capture (extension)",
  campaign_autopilot: "Campaign autopilot run",
  editorial_tick: "Editorial job tick",
  contact_analyze: "Contact analyze (API)",
  campaign_prep_autopilot: "Campaign prep autopilot",
  extension_outreach_draft: "Extension outreach draft",
  brand_coach: "Brand coach chat",
};

export type TelemetryCountRow = {
  key: string;
  label: string;
  count: number;
  failed: number;
  avgDurationMs: number | null;
};

export type LlmFeatureStats = {
  feature: string;
  label: string;
  requests: number;
  failed: number;
  avgDurationMs: number;
  p95DurationMs: number;
  byModel: { model: string; provider: string; requests: number; failed: number }[];
};

export type TelemetrySummary = {
  period: { start: string; end: string; days: number };
  featureUsage: TelemetryCountRow[];
  orchestrations: TelemetryCountRow[];
  llmByFeature: LlmFeatureStats[];
  llmByModel: {
    provider: string;
    model: string;
    requests: number;
    failed: number;
    avgDurationMs: number;
  }[];
  recentEvents: {
    at: string;
    kind: string;
    action: string;
    ok: boolean;
    durationMs?: number;
  }[];
  recentLlmCalls: {
    at: string;
    feature: string;
    model: string;
    provider: string;
    durationMs: number;
    ok: boolean;
    orchestrationId?: string;
  }[];
  logFiles: {
    appEvents: string;
    llmCalls: string;
  };
  cloud: {
    consented: boolean;
    cloudConfigured: boolean;
    instanceId: string | null;
  };
};

function actionLabel(action: string): string {
  return TELEMETRY_ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

function featureLabel(feature: string): string {
  return FINOPS_FEATURE_LABELS[feature] ?? feature.replace(/_/g, " ");
}

function inPeriod(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx] ?? 0;
}

function aggregateEvents(
  events: AppEvent[],
  kind: AppEvent["kind"],
): TelemetryCountRow[] {
  const map = new Map<
    string,
    { count: number; failed: number; durations: number[] }
  >();

  for (const e of events) {
    if (e.kind !== kind) continue;
    const row = map.get(e.action) ?? { count: 0, failed: 0, durations: [] };
    row.count += 1;
    if (!e.ok) row.failed += 1;
    if (e.durationMs != null && Number.isFinite(e.durationMs)) {
      row.durations.push(e.durationMs);
    }
    map.set(e.action, row);
  }

  return [...map.entries()]
    .map(([key, row]) => ({
      key,
      label: actionLabel(key),
      count: row.count,
      failed: row.failed,
      avgDurationMs:
        row.durations.length > 0
          ? Math.round(
              row.durations.reduce((a, b) => a + b, 0) / row.durations.length,
            )
          : null,
    }))
    .sort((a, b) => b.count - a.count);
}

function aggregateLlmByFeature(logs: LlmCallLogEntry[]): LlmFeatureStats[] {
  const map = new Map<
    string,
    {
      durations: number[];
      failed: number;
      models: Map<string, { provider: string; requests: number; failed: number }>;
    }
  >();

  for (const e of logs) {
    const row = map.get(e.feature) ?? {
      durations: [] as number[],
      failed: 0,
      models: new Map<
        string,
        { provider: string; requests: number; failed: number }
      >(),
    };
    row.durations.push(e.durationMs);
    if (!e.ok) row.failed += 1;
    const modelKey = `${e.provider}:${e.model}`;
    const mRow = row.models.get(modelKey) ?? {
      provider: e.provider,
      requests: 0,
      failed: 0,
    };
    mRow.requests += 1;
    if (!e.ok) mRow.failed += 1;
    row.models.set(modelKey, mRow);
    map.set(e.feature, row);
  }

  return [...map.entries()]
    .map(([feature, row]) => {
      const sorted = [...row.durations].sort((a, b) => a - b);
      return {
        feature,
        label: featureLabel(feature),
        requests: row.durations.length,
        failed: row.failed,
        avgDurationMs: Math.round(
          row.durations.reduce((a, b) => a + b, 0) / row.durations.length,
        ),
        p95DurationMs: percentile(sorted, 95),
        byModel: [...row.models.entries()].map(([modelKey, m]) => ({
          model: modelKey.split(":").slice(1).join(":"),
          provider: m.provider,
          requests: m.requests,
          failed: m.failed,
        })),
      };
    })
    .sort((a, b) => b.requests - a.requests);
}

function aggregateLlmByModel(logs: LlmCallLogEntry[]) {
  const map = new Map<
    string,
    { provider: string; model: string; durations: number[]; failed: number }
  >();

  for (const e of logs) {
    const key = `${e.provider}:${e.model}`;
    const row = map.get(key) ?? {
      provider: e.provider,
      model: e.model,
      durations: [],
      failed: 0,
    };
    row.durations.push(e.durationMs);
    if (!e.ok) row.failed += 1;
    map.set(key, row);
  }

  return [...map.values()]
    .map((row) => ({
      provider: row.provider,
      model: row.model,
      requests: row.durations.length,
      failed: row.failed,
      avgDurationMs: Math.round(
        row.durations.reduce((a, b) => a + b, 0) / row.durations.length,
      ),
    }))
    .sort((a, b) => b.requests - a.requests);
}

export async function buildTelemetrySummary(opts?: {
  days?: number;
}): Promise<TelemetrySummary> {
  const days = Math.min(90, Math.max(1, opts?.days ?? 30));
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const [events, llmLogs, cloud] = await Promise.all([
    listAllAppEvents(),
    listAllLlmCallLogs(),
    getTelemetryCloudStatus(),
  ]);

  const filteredEvents = events.filter((e) => inPeriod(e.at, start, end));
  const filteredLlm = llmLogs.filter((e) => inPeriod(e.at, start, end));

  const { resolveDataDirectory } = await import("@/lib/dataPaths");
  const dataDir = resolveDataDirectory();

  return {
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
      days,
    },
    featureUsage: aggregateEvents(filteredEvents, "feature"),
    orchestrations: aggregateEvents(filteredEvents, "orchestration"),
    llmByFeature: aggregateLlmByFeature(filteredLlm),
    llmByModel: aggregateLlmByModel(filteredLlm),
    recentEvents: filteredEvents.slice(0, 20).map((e) => ({
      at: e.at,
      kind: e.kind,
      action: e.action,
      ok: e.ok,
      durationMs: e.durationMs,
    })),
    recentLlmCalls: filteredLlm.slice(0, 20).map((e) => ({
      at: e.at,
      feature: e.feature,
      model: e.model,
      provider: e.provider,
      durationMs: e.durationMs,
      ok: e.ok,
      orchestrationId:
        typeof e.meta?.orchestrationId === "string"
          ? e.meta.orchestrationId
          : undefined,
    })),
    logFiles: {
      appEvents: `${dataDir}/app-events.jsonl`,
      llmCalls: `${dataDir}/llm-call-log.jsonl`,
    },
    cloud,
  };
}
