import { randomInt } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";

export const PACE_KEYS = {
  queueBatchSize: "pace.queue_batch_size",
  minSecondsBetweenProfileOpens: "pace.min_seconds_between_profile_opens",
  minSecondsBetweenCaptures: "pace.min_seconds_between_captures",
  captureMaxPerHour: "pace.capture_max_per_hour",
  paceJitterPercent: "pace.jitter_percent",
  /** Milliseconds the client must wait after the last successful capture (min + random extra). */
  afterCaptureGapMs: "pace.after_capture_gap_ms",
} as const;

export type PaceSettings = {
  queueBatchSize: number;
  minSecondsBetweenProfileOpens: number;
  minSecondsBetweenCaptures: number;
  captureMaxPerHour: number;
  /** 0 = fixed minimums only; otherwise each interval adds 0–N% random extra on top of the minimum. */
  paceJitterPercent: number;
};

export const PACE_DEFAULTS: PaceSettings = {
  /** How many queue items to surface at once before “next batch”. */
  queueBatchSize: 5,
  /** Minimum wait between opening profile links from the dashboard (you still click). */
  minSecondsBetweenProfileOpens: 60,
  /** Minimum spacing between successful extension captures (client + optional server advisory). */
  minSecondsBetweenCaptures: 45,
  /** Rolling 1h cap on capture rows (server); list import counts one row per person. */
  captureMaxPerHour: 40,
  paceJitterPercent: 40,
};

const BOUNDS: Record<keyof PaceSettings, { min: number; max: number }> = {
  queueBatchSize: { min: 1, max: 25 },
  minSecondsBetweenProfileOpens: { min: 15, max: 600 },
  minSecondsBetweenCaptures: { min: 20, max: 600 },
  captureMaxPerHour: { min: 1, max: 40 },
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
    captureMaxPerHour: clampKey(
      "captureMaxPerHour",
      parseStored(
        map.get(PACE_KEYS.captureMaxPerHour),
        PACE_DEFAULTS.captureMaxPerHour,
      ),
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
    captureMaxPerHour: merged.captureMaxPerHour!,
    paceJitterPercent: merged.paceJitterPercent!,
  };
  next.queueBatchSize = clampKey("queueBatchSize", next.queueBatchSize);
  next.minSecondsBetweenProfileOpens = clampKey(
    "minSecondsBetweenProfileOpens",
    next.minSecondsBetweenProfileOpens,
  );
  next.captureMaxPerHour = clampKey(
    "captureMaxPerHour",
    next.captureMaxPerHour,
  );
  next.minSecondsBetweenCaptures = clampKey(
    "minSecondsBetweenCaptures",
    next.minSecondsBetweenCaptures,
  );
  next.paceJitterPercent = clampKey(
    "paceJitterPercent",
    next.paceJitterPercent,
  );

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
    [PACE_KEYS.captureMaxPerHour, String(next.captureMaxPerHour)],
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

/**
 * Gap enforced before the next capture may ingest. Uses the value rolled after the last success,
 * clamped to the current minimum so raising the minimum in settings still applies.
 */
export async function captureRequiredGapMs(pace: PaceSettings): Promise<number> {
  const minMs = pace.minSecondsBetweenCaptures * 1000;
  const db = getDb();
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, PACE_KEYS.afterCaptureGapMs),
  });
  const stored = row?.value !== undefined ? Number(row.value) : NaN;
  const rolled =
    Number.isFinite(stored) && stored > 0 ? stored : minMs;
  return Math.max(rolled, minMs);
}

export async function rollCaptureGapAfterSuccess(pace: PaceSettings): Promise<void> {
  const minMs = pace.minSecondsBetweenCaptures * 1000;
  const gap = nextRandomizedGapMs(minMs, pace.paceJitterPercent);
  await upsertAppSetting(
    PACE_KEYS.afterCaptureGapMs,
    String(Math.max(gap, minMs)),
  );
}

export async function getPaceForApi(): Promise<
  PaceSettings & { captureGapMsRequired: number }
> {
  const pace = await getPaceSettings();
  const captureGapMsRequired = await captureRequiredGapMs(pace);
  return { ...pace, captureGapMsRequired };
}
