import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { nextRandomizedGapMs } from "@/lib/pace";

export const CLEANING_EXEC_KEYS = {
  removalEnabled: "cleaning.removal_enabled",
  engageEnabled: "cleaning.engage_enabled",
  minSecondsBetweenActions: "cleaning.min_seconds_between_actions",
  maxPerDay: "cleaning.max_per_day",
  jitterPercent: "cleaning.jitter_percent",
  afterActionGapMs: "cleaning.after_action_gap_ms",
} as const;

export type CleaningExecSettings = {
  removalEnabled: boolean;
  engageEnabled: boolean;
  minSecondsBetweenActions: number;
  maxPerDay: number;
  jitterPercent: number;
};

const DEFAULTS: CleaningExecSettings = {
  removalEnabled: false,
  engageEnabled: false,
  minSecondsBetweenActions: 90,
  maxPerDay: 20,
  jitterPercent: 35,
};

const BOUNDS = {
  minSecondsBetweenActions: { min: 30, max: 900 },
  maxPerDay: { min: 1, max: 50 },
  jitterPercent: { min: 0, max: 100 },
} as const;

function clamp(
  key: keyof typeof BOUNDS,
  n: number,
): number {
  const { min, max } = BOUNDS[key];
  return Math.round(Math.min(max, Math.max(min, n)));
}

function parseStored(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return raw === "1" || raw === "true";
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

export function startOfLocalDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getCleaningExecSettings(): Promise<CleaningExecSettings> {
  const db = getDb();
  const keys = Object.values(CLEANING_EXEC_KEYS);
  const rows = await db.query.appSettings.findMany({
    where: inArray(appSettings.key, keys),
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    removalEnabled: parseBool(
      map.get(CLEANING_EXEC_KEYS.removalEnabled),
      DEFAULTS.removalEnabled,
    ),
    engageEnabled: parseBool(
      map.get(CLEANING_EXEC_KEYS.engageEnabled),
      DEFAULTS.engageEnabled,
    ),
    minSecondsBetweenActions: clamp(
      "minSecondsBetweenActions",
      parseStored(
        map.get(CLEANING_EXEC_KEYS.minSecondsBetweenActions),
        DEFAULTS.minSecondsBetweenActions,
      ),
    ),
    maxPerDay: clamp(
      "maxPerDay",
      parseStored(map.get(CLEANING_EXEC_KEYS.maxPerDay), DEFAULTS.maxPerDay),
    ),
    jitterPercent: clamp(
      "jitterPercent",
      parseStored(
        map.get(CLEANING_EXEC_KEYS.jitterPercent),
        DEFAULTS.jitterPercent,
      ),
    ),
  };
}

export type CleaningExecSettingsPatch = Partial<CleaningExecSettings>;

export async function updateCleaningExecSettings(
  patch: CleaningExecSettingsPatch,
): Promise<CleaningExecSettings> {
  const current = await getCleaningExecSettings();
  const next: CleaningExecSettings = { ...current, ...patch };
  next.minSecondsBetweenActions = clamp(
    "minSecondsBetweenActions",
    next.minSecondsBetweenActions,
  );
  next.maxPerDay = clamp("maxPerDay", next.maxPerDay);
  next.jitterPercent = clamp("jitterPercent", next.jitterPercent);

  await upsertAppSetting(
    CLEANING_EXEC_KEYS.removalEnabled,
    next.removalEnabled ? "1" : "0",
  );
  await upsertAppSetting(
    CLEANING_EXEC_KEYS.engageEnabled,
    next.engageEnabled ? "1" : "0",
  );
  await upsertAppSetting(
    CLEANING_EXEC_KEYS.minSecondsBetweenActions,
    String(next.minSecondsBetweenActions),
  );
  await upsertAppSetting(
    CLEANING_EXEC_KEYS.maxPerDay,
    String(next.maxPerDay),
  );
  await upsertAppSetting(
    CLEANING_EXEC_KEYS.jitterPercent,
    String(next.jitterPercent),
  );
  return next;
}

export async function actionRequiredGapMs(
  settings: CleaningExecSettings,
): Promise<number> {
  const minMs = settings.minSecondsBetweenActions * 1000;
  const db = getDb();
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, CLEANING_EXEC_KEYS.afterActionGapMs),
  });
  const stored = row?.value !== undefined ? Number(row.value) : NaN;
  const rolled =
    Number.isFinite(stored) && stored > 0 ? stored : minMs;
  return Math.max(rolled, minMs);
}

export async function rollActionGapAfterSuccess(
  settings: CleaningExecSettings,
): Promise<void> {
  const minMs = settings.minSecondsBetweenActions * 1000;
  const gap = nextRandomizedGapMs(minMs, settings.jitterPercent);
  await upsertAppSetting(
    CLEANING_EXEC_KEYS.afterActionGapMs,
    String(Math.max(gap, minMs)),
  );
}

export async function countCleaningExecToday(
  kind: "removal" | "engage",
  outcome: string,
): Promise<number> {
  const sqlite = (await import("@/db")).getSqlite();
  const dayStart = startOfLocalDay().getTime();
  const row = sqlite
    .prepare(
      `SELECT COUNT(*) AS c FROM cleaning_exec_queue
       WHERE kind = ? AND outcome = ? AND completed_at >= ?`,
    )
    .get(kind, outcome, dayStart) as { c: number } | undefined;
  return row?.c ?? 0;
}

export async function logCleaningExecAction(args: {
  contactId: string;
  kind: string;
  outcome: string;
  error?: string | null;
}): Promise<void> {
  const sqlite = (await import("@/db")).getSqlite();
  const { randomUUID } = await import("node:crypto");
  sqlite
    .prepare(
      `INSERT INTO automation_log (id, contact_id, kind, outcome, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      args.contactId,
      `cleaning_${args.kind}`,
      args.outcome,
      Date.now(),
    );
}
