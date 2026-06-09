import { randomInt } from "node:crypto";
import { and, count, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings, captureSessions } from "@/db/schema";

export const PACE_KEYS = {
  queueBatchSize: "pace.queue_batch_size",
  minSecondsBetweenProfileOpens: "pace.min_seconds_between_profile_opens",
  minSecondsBetweenCaptures: "pace.min_seconds_between_captures",
  minSecondsBetweenListImports: "pace.min_seconds_between_list_imports",
  /** Legacy key — migrated to profileCaptureMaxPerHour when unset. */
  captureMaxPerHour: "pace.capture_max_per_hour",
  listImportMaxPerHour: "pace.list_import_max_per_hour",
  profileCaptureMaxPerHour: "pace.profile_capture_max_per_hour",
  paceJitterPercent: "pace.jitter_percent",
  /** Milliseconds the client must wait after the last successful profile capture. */
  afterCaptureGapMs: "pace.after_capture_gap_ms",
  /** Milliseconds the client must wait after the last successful list import round. */
  afterListImportGapMs: "pace.after_list_import_gap_ms",
  /** ISO timestamp — hourly caps ignore capture_sessions before this (local reset). */
  hourlyCountFloorAt: "pace.hourly_count_floor_at",
} as const;

export type PaceSettings = {
  queueBatchSize: number;
  minSecondsBetweenProfileOpens: number;
  /** Minimum spacing between profile / messaging / posts captures. */
  minSecondsBetweenCaptures: number;
  /** Minimum spacing between connections list page imports. */
  minSecondsBetweenListImports: number;
  /** Rolling 1h cap on shallow list rows (pageType connections). */
  listImportMaxPerHour: number;
  /** Rolling 1h cap on profile visits and deep captures. */
  profileCaptureMaxPerHour: number;
  /** 0 = fixed minimums only; otherwise each interval adds 0–N% random extra on top of the minimum. */
  paceJitterPercent: number;
};

export const PACE_DEFAULTS: PaceSettings = {
  queueBatchSize: 5,
  minSecondsBetweenProfileOpens: 60,
  minSecondsBetweenCaptures: 40,
  minSecondsBetweenListImports: 10,
  listImportMaxPerHour: 120,
  profileCaptureMaxPerHour: 40,
  paceJitterPercent: 40,
};

const BOUNDS: Record<keyof PaceSettings, { min: number; max: number }> = {
  queueBatchSize: { min: 1, max: 25 },
  minSecondsBetweenProfileOpens: { min: 15, max: 600 },
  minSecondsBetweenCaptures: { min: 20, max: 600 },
  minSecondsBetweenListImports: { min: 5, max: 120 },
  listImportMaxPerHour: { min: 10, max: 200 },
  profileCaptureMaxPerHour: { min: 1, max: 60 },
  paceJitterPercent: { min: 0, max: 100 },
};

function clampKey<K extends keyof PaceSettings>(
  key: K,
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

export async function getPaceSettings(): Promise<PaceSettings> {
  const db = getDb();
  const keys = Object.values(PACE_KEYS);
  const rows = await db.query.appSettings.findMany({
    where: inArray(appSettings.key, keys),
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const legacyProfileCap = parseStored(
    map.get(PACE_KEYS.captureMaxPerHour),
    PACE_DEFAULTS.profileCaptureMaxPerHour,
  );
  const profileCapStored = map.get(PACE_KEYS.profileCaptureMaxPerHour);

  return {
    queueBatchSize: clampKey(
      "queueBatchSize",
      parseStored(map.get(PACE_KEYS.queueBatchSize), PACE_DEFAULTS.queueBatchSize),
    ),
    minSecondsBetweenProfileOpens: clampKey(
      "minSecondsBetweenProfileOpens",
      parseStored(
        map.get(PACE_KEYS.minSecondsBetweenProfileOpens),
        PACE_DEFAULTS.minSecondsBetweenProfileOpens,
      ),
    ),
    minSecondsBetweenCaptures: clampKey(
      "minSecondsBetweenCaptures",
      parseStored(
        map.get(PACE_KEYS.minSecondsBetweenCaptures),
        PACE_DEFAULTS.minSecondsBetweenCaptures,
      ),
    ),
    minSecondsBetweenListImports: clampKey(
      "minSecondsBetweenListImports",
      parseStored(
        map.get(PACE_KEYS.minSecondsBetweenListImports),
        PACE_DEFAULTS.minSecondsBetweenListImports,
      ),
    ),
    listImportMaxPerHour: clampKey(
      "listImportMaxPerHour",
      parseStored(
        map.get(PACE_KEYS.listImportMaxPerHour),
        PACE_DEFAULTS.listImportMaxPerHour,
      ),
    ),
    profileCaptureMaxPerHour: clampKey(
      "profileCaptureMaxPerHour",
      profileCapStored !== undefined
        ? parseStored(profileCapStored, PACE_DEFAULTS.profileCaptureMaxPerHour)
        : legacyProfileCap,
    ),
    paceJitterPercent: clampKey(
      "paceJitterPercent",
      parseStored(
        map.get(PACE_KEYS.paceJitterPercent),
        PACE_DEFAULTS.paceJitterPercent,
      ),
    ),
  };
}

export async function updatePaceSettings(patch: Partial<PaceSettings>): Promise<PaceSettings> {
  const current = await getPaceSettings();
  const merged: Partial<PaceSettings> = { ...current };
  (Object.keys(patch) as (keyof PaceSettings)[]).forEach((k) => {
    const v = patch[k];
    if (typeof v === "number" && Number.isFinite(v)) merged[k] = v;
  });
  const next: PaceSettings = {
    queueBatchSize: merged.queueBatchSize!,
    minSecondsBetweenProfileOpens: merged.minSecondsBetweenProfileOpens!,
    minSecondsBetweenCaptures: merged.minSecondsBetweenCaptures!,
    minSecondsBetweenListImports: merged.minSecondsBetweenListImports!,
    listImportMaxPerHour: merged.listImportMaxPerHour!,
    profileCaptureMaxPerHour: merged.profileCaptureMaxPerHour!,
    paceJitterPercent: merged.paceJitterPercent!,
  };
  (Object.keys(next) as (keyof PaceSettings)[]).forEach((k) => {
    next[k] = clampKey(k, next[k]);
  });

  const db = getDb();
  const now = new Date();
  const entries: [string, string][] = [
    [PACE_KEYS.queueBatchSize, String(next.queueBatchSize)],
    [
      PACE_KEYS.minSecondsBetweenProfileOpens,
      String(next.minSecondsBetweenProfileOpens),
    ],
    [
      PACE_KEYS.minSecondsBetweenCaptures,
      String(next.minSecondsBetweenCaptures),
    ],
    [
      PACE_KEYS.minSecondsBetweenListImports,
      String(next.minSecondsBetweenListImports),
    ],
    [PACE_KEYS.listImportMaxPerHour, String(next.listImportMaxPerHour)],
    [
      PACE_KEYS.profileCaptureMaxPerHour,
      String(next.profileCaptureMaxPerHour),
    ],
    [PACE_KEYS.paceJitterPercent, String(next.paceJitterPercent)],
  ];

  for (const [key, value] of entries) {
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

  return next;
}

/**
 * Milliseconds to wait after the previous action before the next (minimum + optional random extra).
 */
export function nextRandomizedGapMs(minMs: number, jitterPercent: number): number {
  const jitter = Math.max(0, Math.min(100, Math.floor(jitterPercent)));
  if (jitter === 0) return Math.round(minMs);
  const extraMax = Math.floor((minMs * jitter) / 100);
  const extra = extraMax <= 0 ? 0 : randomInt(0, extraMax + 1);
  return Math.round(minMs + extra);
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

async function requiredGapMs(
  pace: PaceSettings,
  gapKey: string,
  minSeconds: number,
): Promise<number> {
  const minMs = minSeconds * 1000;
  const db = getDb();
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, gapKey),
  });
  const stored = row?.value !== undefined ? Number(row.value) : NaN;
  const rolled =
    Number.isFinite(stored) && stored > 0 ? stored : minMs;
  return Math.max(rolled, minMs);
}

/**
 * Gap enforced before the next profile capture may ingest.
 */
export async function captureRequiredGapMs(pace: PaceSettings): Promise<number> {
  return requiredGapMs(
    pace,
    PACE_KEYS.afterCaptureGapMs,
    pace.minSecondsBetweenCaptures,
  );
}

/**
 * Gap enforced before the next list import round may ingest.
 */
export async function listImportRequiredGapMs(pace: PaceSettings): Promise<number> {
  return requiredGapMs(
    pace,
    PACE_KEYS.afterListImportGapMs,
    pace.minSecondsBetweenListImports,
  );
}

export async function rollCaptureGapAfterSuccess(pace: PaceSettings): Promise<void> {
  const minMs = pace.minSecondsBetweenCaptures * 1000;
  const gap = nextRandomizedGapMs(minMs, pace.paceJitterPercent);
  await upsertAppSetting(
    PACE_KEYS.afterCaptureGapMs,
    String(Math.max(gap, minMs)),
  );
}

export async function rollListImportGapAfterSuccess(pace: PaceSettings): Promise<void> {
  const minMs = pace.minSecondsBetweenListImports * 1000;
  const gap = nextRandomizedGapMs(minMs, pace.paceJitterPercent);
  await upsertAppSetting(
    PACE_KEYS.afterListImportGapMs,
    String(Math.max(gap, minMs)),
  );
}

const hourAgoDate = () => new Date(Date.now() - 60 * 60 * 1000);

async function hourlyCountSince(): Promise<Date> {
  const hourAgo = hourAgoDate();
  const db = getDb();
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, PACE_KEYS.hourlyCountFloorAt),
  });
  if (!row?.value) return hourAgo;
  const floor = new Date(row.value);
  if (Number.isNaN(floor.getTime())) return hourAgo;
  return floor > hourAgo ? floor : hourAgo;
}

export async function countHourlyListImports(): Promise<number> {
  const db = getDb();
  const since = await hourlyCountSince();
  const [row] = await db
    .select({ n: count() })
    .from(captureSessions)
    .where(
      and(
        gte(captureSessions.capturedAt, since),
        eq(captureSessions.pageType, "connections"),
      ),
    );
  return row?.n ?? 0;
}

export async function countHourlyProfileCaptures(): Promise<number> {
  const db = getDb();
  const since = await hourlyCountSince();
  const [row] = await db
    .select({ n: count() })
    .from(captureSessions)
    .where(
      and(
        gte(captureSessions.capturedAt, since),
        ne(captureSessions.pageType, "connections"),
      ),
    );
  return row?.n ?? 0;
}

export async function latestListImportAt(): Promise<Date | null> {
  const db = getDb();
  const [row] = await db
    .select({ capturedAt: captureSessions.capturedAt })
    .from(captureSessions)
    .where(eq(captureSessions.pageType, "connections"))
    .orderBy(desc(captureSessions.capturedAt))
    .limit(1);
  return row?.capturedAt ?? null;
}

export async function latestProfileCaptureAt(): Promise<Date | null> {
  const db = getDb();
  const [row] = await db
    .select({ capturedAt: captureSessions.capturedAt })
    .from(captureSessions)
    .where(ne(captureSessions.pageType, "connections"))
    .orderBy(desc(captureSessions.capturedAt))
    .limit(1);
  return row?.capturedAt ?? null;
}

export async function getPaceForApi(): Promise<
  PaceSettings & {
    captureGapMsRequired: number;
    listImportGapMsRequired: number;
    profileCaptureGapMsRequired: number;
  }
> {
  const pace = await getPaceSettings();
  const captureGapMsRequired = await captureRequiredGapMs(pace);
  const listImportGapMsRequired = await listImportRequiredGapMs(pace);
  return {
    ...pace,
    captureGapMsRequired,
    listImportGapMsRequired,
    profileCaptureGapMsRequired: captureGapMsRequired,
  };
}

export type PaceUsageSnapshot = {
  listImportsLastHour: number;
  profileCapturesLastHour: number;
  listSlotsRemaining: number;
  profileSlotsRemaining: number;
};

export async function getPaceUsage(): Promise<PaceUsageSnapshot> {
  const pace = await getPaceSettings();
  const listImportsLastHour = await countHourlyListImports();
  const profileCapturesLastHour = await countHourlyProfileCaptures();
  return {
    listImportsLastHour,
    profileCapturesLastHour,
    listSlotsRemaining: Math.max(
      0,
      pace.listImportMaxPerHour - listImportsLastHour,
    ),
    profileSlotsRemaining: Math.max(
      0,
      pace.profileCaptureMaxPerHour - profileCapturesLastHour,
    ),
  };
}

/** Clears rolled gap timers so the next capture/import is not blocked by a wait. */
export async function resetPaceGapTimers(): Promise<void> {
  const db = getDb();
  await db
    .delete(appSettings)
    .where(
      inArray(appSettings.key, [
        PACE_KEYS.afterCaptureGapMs,
        PACE_KEYS.afterListImportGapMs,
      ]),
    );
}

/** Hourly caps start counting from now (capture history is kept). */
export async function resetPaceHourlyCounters(): Promise<void> {
  await upsertAppSetting(
    PACE_KEYS.hourlyCountFloorAt,
    new Date().toISOString(),
  );
}

export async function resetAllPaceState(): Promise<void> {
  await resetPaceGapTimers();
  await resetPaceHourlyCounters();
}
