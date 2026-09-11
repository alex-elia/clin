import { eq, inArray } from "drizzle-orm";
import { getDb, getSqlite } from "@/db";
import { appSettings } from "@/db/schema";
import type { AutopilotActionPolicy } from "@/lib/autopilotActions";
import {
  defaultAutopilotAnalyzeBody,
  executeContactAnalysis,
} from "@/lib/contactAnalyzeRunner";
import { backfillContactFieldsFromLatestProfileCapture } from "@/lib/contactProfileBackfill";
import { getLlmConfig } from "@/lib/llm/completeChat";

/** Shared WHERE for contacts eligible for LLM batch (profile capture + analyzable text). */
const PENDING_LLM_WHERE_SQL = `
  EXISTS (
    SELECT 1 FROM capture_sessions s
    WHERE s.contact_id = c.id AND s.page_type = 'profile'
  )
  AND trim(coalesce(c.llm_provisional_json, '')) = ''
  AND trim(coalesce(c.llm_refined_json, '')) = ''
  AND (
    trim(coalesce(c.full_name, '')) != ''
    OR trim(coalesce(c.headline, '')) != ''
    OR EXISTS (
      SELECT 1 FROM capture_sessions s2
      WHERE s2.contact_id = c.id AND s2.page_type = 'profile'
      AND (
        length(trim(coalesce(json_extract(s2.extracted_json, '$.fullName'), ''))) > 1
        OR length(trim(coalesce(json_extract(s2.extracted_json, '$.headline'), ''))) > 1
      )
    )
  )`;

const PENDING_LLM_OPEN_SQL = `${PENDING_LLM_WHERE_SQL}
  AND c.cleaning_dismissed_at IS NULL
  AND lower(trim(coalesce(c.connection_degree, ''))) != 'disconnected'`;

export const AUTOPILOT_KEYS = {
  analyzeAfterProfileCapture: "autopilot.analyze_after_profile_capture",
  batchDefaultLimit: "autopilot.batch_default_limit",
  campaignDraftOnReachOut: "autopilot.campaign_draft_on_reach_out",
  campaignTagSkipGhost: "autopilot.campaign_tag_skip_ghost",
  campaignTagNurtureWarm: "autopilot.campaign_tag_nurture_warm",
} as const;

export type AutopilotSettings = {
  analyzeAfterProfileCapture: boolean;
  batchDefaultLimit: number;
  campaignDraftOnReachOut: boolean;
  campaignTagSkipGhost: boolean;
  campaignTagNurtureWarm: boolean;
};

export type AutopilotActionPolicySettings = Pick<
  AutopilotSettings,
  | "campaignDraftOnReachOut"
  | "campaignTagSkipGhost"
  | "campaignTagNurtureWarm"
>;

const DEFAULTS: AutopilotSettings = {
  analyzeAfterProfileCapture: true,
  batchDefaultLimit: 8,
  campaignDraftOnReachOut: true,
  campaignTagSkipGhost: false,
  campaignTagNurtureWarm: false,
};

const BATCH_LIMIT_BOUNDS = { min: 1, max: 30 } as const;

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return raw === "1" || raw === "true";
}

function parseStoredInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function clampBatch(n: number): number {
  return Math.min(
    BATCH_LIMIT_BOUNDS.max,
    Math.max(BATCH_LIMIT_BOUNDS.min, n),
  );
}

async function upsertAppSetting(key: string, value: string) {
  const db = getDb();
  const now = new Date();
  const existing = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, key),
  });
  if (existing) {
    await db
      .update(appSettings)
      .set({ value, updatedAt: now })
      .where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value, updatedAt: now });
  }
}

export async function getAutopilotSettings(): Promise<AutopilotSettings> {
  const db = getDb();
  const keys = Object.values(AUTOPILOT_KEYS);
  const rows = await db.query.appSettings.findMany({
    where: inArray(appSettings.key, keys),
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  return {
    analyzeAfterProfileCapture: parseBool(
      map.get(AUTOPILOT_KEYS.analyzeAfterProfileCapture),
      DEFAULTS.analyzeAfterProfileCapture,
    ),
    batchDefaultLimit: clampBatch(
      parseStoredInt(
        map.get(AUTOPILOT_KEYS.batchDefaultLimit),
        DEFAULTS.batchDefaultLimit,
      ),
    ),
    campaignDraftOnReachOut: parseBool(
      map.get(AUTOPILOT_KEYS.campaignDraftOnReachOut),
      DEFAULTS.campaignDraftOnReachOut,
    ),
    campaignTagSkipGhost: parseBool(
      map.get(AUTOPILOT_KEYS.campaignTagSkipGhost),
      DEFAULTS.campaignTagSkipGhost,
    ),
    campaignTagNurtureWarm: parseBool(
      map.get(AUTOPILOT_KEYS.campaignTagNurtureWarm),
      DEFAULTS.campaignTagNurtureWarm,
    ),
  };
}

export function autopilotActionPolicyFromSettings(
  s: AutopilotSettings,
): AutopilotActionPolicy {
  return {
    draftOnReachOut: s.campaignDraftOnReachOut,
    tagSkipAsGhost: s.campaignTagSkipGhost,
    tagNurtureAsWarm: s.campaignTagNurtureWarm,
  };
}

export type AutopilotSettingsPatch = Partial<{
  analyzeAfterProfileCapture: boolean;
  batchDefaultLimit: number;
  campaignDraftOnReachOut: boolean;
  campaignTagSkipGhost: boolean;
  campaignTagNurtureWarm: boolean;
}>;

export async function updateAutopilotSettings(
  patch: AutopilotSettingsPatch,
): Promise<AutopilotSettings> {
  const current = await getAutopilotSettings();
  const next: AutopilotSettings = { ...current };
  if (typeof patch.analyzeAfterProfileCapture === "boolean") {
    next.analyzeAfterProfileCapture = patch.analyzeAfterProfileCapture;
  }
  if (
    typeof patch.batchDefaultLimit === "number" &&
    Number.isFinite(patch.batchDefaultLimit)
  ) {
    next.batchDefaultLimit = clampBatch(patch.batchDefaultLimit);
  }
  if (typeof patch.campaignDraftOnReachOut === "boolean") {
    next.campaignDraftOnReachOut = patch.campaignDraftOnReachOut;
  }
  if (typeof patch.campaignTagSkipGhost === "boolean") {
    next.campaignTagSkipGhost = patch.campaignTagSkipGhost;
  }
  if (typeof patch.campaignTagNurtureWarm === "boolean") {
    next.campaignTagNurtureWarm = patch.campaignTagNurtureWarm;
  }

  await upsertAppSetting(
    AUTOPILOT_KEYS.analyzeAfterProfileCapture,
    next.analyzeAfterProfileCapture ? "1" : "0",
  );
  await upsertAppSetting(
    AUTOPILOT_KEYS.batchDefaultLimit,
    String(next.batchDefaultLimit),
  );
  await upsertAppSetting(
    AUTOPILOT_KEYS.campaignDraftOnReachOut,
    next.campaignDraftOnReachOut ? "1" : "0",
  );
  await upsertAppSetting(
    AUTOPILOT_KEYS.campaignTagSkipGhost,
    next.campaignTagSkipGhost ? "1" : "0",
  );
  await upsertAppSetting(
    AUTOPILOT_KEYS.campaignTagNurtureWarm,
    next.campaignTagNurtureWarm ? "1" : "0",
  );
  return next;
}

/**
 * Contacts with at least one profile capture, some visible text, and no stored LLM JSON yet.
 * Uses raw SQL because LLM columns are optional SQLite ALTERs (not on Drizzle schema).
 */
export function countContactsPendingLlmAnalysis(): number {
  try {
    const row = getSqlite()
      .prepare(
        `SELECT COUNT(*) AS n
         FROM contacts c
         WHERE ${PENDING_LLM_OPEN_SQL}`,
      )
      .get() as { n: number } | undefined;
    return Number(row?.n) || 0;
  } catch {
    try {
      const row = getSqlite()
        .prepare(
          `SELECT COUNT(*) AS n
           FROM contacts c
           WHERE ${PENDING_LLM_WHERE_SQL}`,
        )
        .get() as { n: number } | undefined;
      return Number(row?.n) || 0;
    } catch {
      return 0;
    }
  }
}

export function listContactIdsPendingLlmAnalysisRaw(
  limit: number,
  excludeContactIds: string[] = [],
): string[] {
  const lim = clampBatch(limit);
  const exclude = [...new Set(excludeContactIds.filter(Boolean))];
  try {
    const excludeSql =
      exclude.length > 0
        ? `AND c.id NOT IN (${exclude.map(() => "?").join(",")})`
        : "";
    const stmt = getSqlite().prepare(
      `SELECT c.id AS id
       FROM contacts c
       WHERE ${PENDING_LLM_OPEN_SQL}
       ${excludeSql}
       ORDER BY c.last_updated_at DESC
       LIMIT ?`,
    );
    const out = (
      exclude.length > 0
        ? stmt.all(...exclude, lim)
        : stmt.all(lim)
    ) as { id: string }[];
    return out.map((r) => r.id);
  } catch {
    try {
      const excludeSql =
        exclude.length > 0
          ? `AND c.id NOT IN (${exclude.map(() => "?").join(",")})`
          : "";
      const stmt = getSqlite().prepare(
        `SELECT c.id AS id
         FROM contacts c
         WHERE ${PENDING_LLM_WHERE_SQL}
         ${excludeSql}
         ORDER BY c.last_updated_at DESC
         LIMIT ?`,
      );
      const out = (
        exclude.length > 0
          ? stmt.all(...exclude, lim)
          : stmt.all(lim)
      ) as { id: string }[];
      return out.map((r) => r.id);
    } catch {
      return [];
    }
  }
}

export async function resolvePendingLlmContactIds(
  limit: number,
  excludeContactIds: string[] = [],
): Promise<string[]> {
  return listContactIdsPendingLlmAnalysisRaw(limit, excludeContactIds);
}

export type BatchAnalyzeItemResult =
  | { contactId: string; ok: true; tier: string }
  | { contactId: string; ok: false; error: string };

export async function runLlmAnalysisBatch(opts: {
  limit: number;
  excludeContactIds?: string[];
}): Promise<{ results: BatchAnalyzeItemResult[] }> {
  const db = getDb();
  const llm = await getLlmConfig();
  const ids = await resolvePendingLlmContactIds(
    opts.limit,
    opts.excludeContactIds ?? [],
  );
  const results: BatchAnalyzeItemResult[] = [];
  const body = defaultAutopilotAnalyzeBody();

  for (const contactId of ids) {
    try {
      await backfillContactFieldsFromLatestProfileCapture(db, contactId);
      const { tier } = await executeContactAnalysis(db, contactId, body, llm);
      results.push({ contactId, ok: true, tier });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      results.push({ contactId, ok: false, error });
    }
  }

  return { results };
}

/**
 * Fire-and-forget after profile or messaging ingest when the setting is on.
 */
export function maybeAutopilotAnalyzeAfterCapture(
  contactId: string,
  pageType: string,
): void {
  if (pageType !== "profile" && pageType !== "messaging") return;

  void (async () => {
    try {
      const settings = await getAutopilotSettings();
      if (!settings.analyzeAfterProfileCapture) return;
      const db = getDb();
      const llm = await getLlmConfig();
      await executeContactAnalysis(
        db,
        contactId,
        defaultAutopilotAnalyzeBody(),
        llm,
      );
    } catch (err) {
      console.error(
        "[clin autopilot] analyze after capture failed:",
        contactId,
        pageType,
        err,
      );
    }
  })();
}

/** @deprecated Use maybeAutopilotAnalyzeAfterCapture */
export function maybeAutopilotAnalyzeAfterProfileCapture(
  contactId: string,
  pageType: string,
): void {
  maybeAutopilotAnalyzeAfterCapture(contactId, pageType);
}
