import { getLlmConfigPublic } from "@/lib/llm/config";
import { getSdSettingsPublic } from "@/lib/sdSettings";
import { listAllLlmCallLogs, type LlmCallLogEntry } from "@/lib/llm/llmCallLog";
import {
  estimateCloudCostEur,
  isCloudBillableProvider,
  resolveUsageTokens,
} from "@/lib/llm/llmPricing";

export const FINOPS_FEATURE_LABELS: Record<string, string> = {
  brand_coach: "Brand coach",
  copy_assistant: "Copy assistant",
  post_image_prompt: "Post image prompt",
  contact_analyze: "Contact analysis",
  outreach_draft: "Outreach draft",
  voice_setup: "Voice setup",
  user_profile: "User profile LLM",
  ingest_trends: "Trend ingest (Tavily)",
  ingest_sources: "Source ingest",
  llm: "Other LLM",
};

export type FinOpsBreakdownRow = {
  key: string;
  label: string;
  requests: number;
  tokens: number;
  costEur: number;
  failed: number;
};

export type FinOpsDayRow = {
  date: string;
  requests: number;
  tokens: number;
  costEur: number;
};

export type FinOpsSummary = {
  period: { start: string; end: string; days: number };
  activeTools: {
    llmProvider: string;
    llmModel: string;
    llmBillable: boolean;
    tavilyConfigured: boolean;
    imageGenEnabled: boolean;
  };
  cloud: {
    totalCostEur: number;
    totalRequests: number;
    totalTokens: number;
    failedRequests: number;
    avgCostPerRequest: number;
  };
  local: {
    totalRequests: number;
    totalTokens: number;
  };
  byFeature: FinOpsBreakdownRow[];
  byModel: FinOpsBreakdownRow[];
  byProvider: FinOpsBreakdownRow[];
  byDay: FinOpsDayRow[];
  recentBillable: {
    at: string;
    feature: string;
    provider: string;
    model: string;
    costEur: number;
    tokens: number;
    ok: boolean;
  }[];
};

function featureLabel(feature: string): string {
  return FINOPS_FEATURE_LABELS[feature] ?? feature.replace(/_/g, " ");
}

function entryCostEur(entry: LlmCallLogEntry): number {
  if (entry.estimatedCostEur != null && Number.isFinite(entry.estimatedCostEur)) {
    return entry.estimatedCostEur;
  }
  if (!isCloudBillableProvider(entry.provider) && entry.billable !== true) {
    return 0;
  }
  const tokens = resolveUsageTokens(entry);
  const cost = estimateCloudCostEur({
    provider: entry.provider,
    model: entry.model,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
  });
  return cost ?? 0;
}

function isBillableEntry(entry: LlmCallLogEntry): boolean {
  if (entry.billable === true) return true;
  if (entry.provider === "tavily") return true;
  return entry.provider === "openai_compatible";
}

function isLocalEntry(entry: LlmCallLogEntry): boolean {
  return entry.provider === "ollama" && entry.billable !== true;
}

function inPeriod(entry: LlmCallLogEntry, start: Date, end: Date): boolean {
  const t = new Date(entry.at).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function bump(
  map: Map<string, FinOpsBreakdownRow>,
  key: string,
  label: string,
  entry: LlmCallLogEntry,
  cost: number,
  tokens: number,
): void {
  const row = map.get(key) ?? {
    key,
    label,
    requests: 0,
    tokens: 0,
    costEur: 0,
    failed: 0,
  };
  row.requests += 1;
  row.tokens += tokens;
  row.costEur += cost;
  if (!entry.ok) row.failed += 1;
  map.set(key, row);
}

export async function buildFinOpsSummary(opts?: {
  days?: number;
}): Promise<FinOpsSummary> {
  const days = Math.min(90, Math.max(1, opts?.days ?? 30));
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const [logs, llm, sd] = await Promise.all([
    listAllLlmCallLogs(),
    getLlmConfigPublic(),
    getSdSettingsPublic(),
  ]);

  const filtered = logs.filter((e) => inPeriod(e, start, end));

  let cloudCost = 0;
  let cloudRequests = 0;
  let cloudTokens = 0;
  let cloudFailed = 0;
  let localRequests = 0;
  let localTokens = 0;

  const byFeature = new Map<string, FinOpsBreakdownRow>();
  const byModel = new Map<string, FinOpsBreakdownRow>();
  const byProvider = new Map<string, FinOpsBreakdownRow>();
  const byDay = new Map<string, FinOpsDayRow>();

  for (const entry of filtered) {
    const tokens = resolveUsageTokens(entry).totalTokens;
    const cost = isBillableEntry(entry) ? entryCostEur(entry) : 0;

    if (isLocalEntry(entry)) {
      localRequests += 1;
      localTokens += tokens;
    } else if (isBillableEntry(entry)) {
      cloudRequests += 1;
      cloudTokens += tokens;
      cloudCost += cost;
      if (!entry.ok) cloudFailed += 1;

      bump(byFeature, entry.feature, featureLabel(entry.feature), entry, cost, tokens);
      bump(
        byModel,
        `${entry.provider}:${entry.model}`,
        entry.model,
        entry,
        cost,
        tokens,
      );
      bump(
        byProvider,
        entry.provider,
        entry.provider,
        entry,
        cost,
        tokens,
      );

      const dayKey = entry.at.slice(0, 10);
      const dayRow = byDay.get(dayKey) ?? {
        date: dayKey,
        requests: 0,
        tokens: 0,
        costEur: 0,
      };
      dayRow.requests += 1;
      dayRow.tokens += tokens;
      dayRow.costEur += cost;
      byDay.set(dayKey, dayRow);
    }
  }

  const recentBillable = filtered
    .filter((e) => isBillableEntry(e))
    .slice(0, 15)
    .map((e) => ({
      at: e.at,
      feature: e.feature,
      provider: e.provider,
      model: e.model,
      costEur: entryCostEur(e),
      tokens: resolveUsageTokens(e).totalTokens,
      ok: e.ok,
    }));

  return {
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
      days,
    },
    activeTools: {
      llmProvider: llm.provider,
      llmModel:
        llm.provider === "ollama" ? llm.ollama.model : llm.cloud.model,
      llmBillable: llm.provider === "openai_compatible",
      tavilyConfigured: Boolean(process.env.TAVILY_API_KEY?.trim()),
      imageGenEnabled: sd.enabled,
    },
    cloud: {
      totalCostEur: Math.round(cloudCost * 10000) / 10000,
      totalRequests: cloudRequests,
      totalTokens: cloudTokens,
      failedRequests: cloudFailed,
      avgCostPerRequest:
        cloudRequests > 0
          ? Math.round((cloudCost / cloudRequests) * 10000) / 10000
          : 0,
    },
    local: {
      totalRequests: localRequests,
      totalTokens: localTokens,
    },
    byFeature: [...byFeature.values()].sort((a, b) => b.costEur - a.costEur),
    byModel: [...byModel.values()].sort((a, b) => b.costEur - a.costEur),
    byProvider: [...byProvider.values()].sort((a, b) => b.costEur - a.costEur),
    byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    recentBillable,
  };
}
