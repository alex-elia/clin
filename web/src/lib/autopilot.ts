import { eq, inArray } from "drizzle-orm";
import { getDb, getSqlite } from "@/db";
import { appSettings } from "@/db/schema";
import {
  defaultAutopilotAnalyzeBody,
  executeContactAnalysis,
} from "@/lib/contactAnalyzeRunner";
import { getOllamaSettings } from "@/lib/ollamaSettings";

export const AUTOPILOT_KEYS = {
  analyzeAfterProfileCapture: "autopilot.analyze_after_profile_capture",
  batchDefaultLimit: "autopilot.batch_default_limit",
} as const;

export type AutopilotSettings = {
  analyzeAfterProfileCapture: boolean;
  batchDefaultLimit: number;
};

const DEFAULTS: AutopilotSettings = {
  analyzeAfterProfileCapture: false,
  batchDefaultLimit: 8,
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
  };
}

export type AutopilotSettingsPatch = Partial<{
  analyzeAfterProfileCapture: boolean;
  batchDefaultLimit: number;
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

  await upsertAppSetting(
    AUTOPILOT_KEYS.analyzeAfterProfileCapture,
    next.analyzeAfterProfileCapture ? "1" : "0",
  );
  await upsertAppSetting(
    AUTOPILOT_KEYS.batchDefaultLimit,
    String(next.batchDefaultLimit),
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
         WHERE EXISTS (
           SELECT 1 FROM capture_sessions s
           WHERE s.contact_id = c.id AND s.page_type = 'profile'
         )
         AND (trim(coalesce(c.full_name, '')) != '' OR trim(coalesce(c.headline, '')) != '')
         AND trim(coalesce(c.llm_provisional_json, '')) = ''
         AND trim(coalesce(c.llm_refined_json, '')) = ''`,
      )
      .get() as { n: number } | undefined;
    return Number(row?.n) || 0;
  } catch {
    return 0;
  }
}

export function listContactIdsPendingLlmAnalysisRaw(limit: number): string[] {
  const lim = clampBatch(limit);
  try {
    const stmt = getSqlite().prepare(
      `SELECT c.id AS id
       FROM contacts c
       WHERE EXISTS (
         SELECT 1 FROM capture_sessions s
         WHERE s.contact_id = c.id AND s.page_type = 'profile'
       )
       AND (trim(coalesce(c.full_name, '')) != '' OR trim(coalesce(c.headline, '')) != '')
       AND trim(coalesce(c.llm_provisional_json, '')) = ''
       AND trim(coalesce(c.llm_refined_json, '')) = ''
       ORDER BY c.last_updated_at DESC
       LIMIT ?`,
    );
    const out = stmt.all(lim) as { id: string }[];
    return out.map((r) => r.id);
  } catch {
    return [];
  }
}

export async function resolvePendingLlmContactIds(limit: number): Promise<
  string[]
> {
  return listContactIdsPendingLlmAnalysisRaw(limit);
}

export type BatchAnalyzeItemResult =
  | { contactId: string; ok: true; tier: string }
  | { contactId: string; ok: false; error: string };

export async function runLlmAnalysisBatch(opts: {
  limit: number;
}): Promise<{ results: BatchAnalyzeItemResult[] }> {
  const db = getDb();
  const ollama = await getOllamaSettings();
  const ids = await resolvePendingLlmContactIds(opts.limit);
  const results: BatchAnalyzeItemResult[] = [];
  const body = defaultAutopilotAnalyzeBody();

  for (const contactId of ids) {
    try {
      const { tier } = await executeContactAnalysis(db, contactId, body, ollama);
      results.push({ contactId, ok: true, tier });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      results.push({ contactId, ok: false, error });
    }
  }

  return { results };
}

/**
 * Fire-and-forget after a successful profile ingest when the setting is on.
 */
export function maybeAutopilotAnalyzeAfterProfileCapture(
  contactId: string,
  pageType: string,
): void {
  if (pageType !== "profile") return;

  void (async () => {
    try {
      const settings = await getAutopilotSettings();
      if (!settings.analyzeAfterProfileCapture) return;
      const db = getDb();
      const ollama = await getOllamaSettings();
      await executeContactAnalysis(
        db,
        contactId,
        defaultAutopilotAnalyzeBody(),
        ollama,
      );
    } catch (err) {
      console.error(
        "[clin autopilot] analyze after profile capture failed:",
        contactId,
        err,
      );
    }
  })();
}
