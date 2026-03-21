import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";

export const PACE_KEYS = {
  queueBatchSize: "pace.queue_batch_size",
  minSecondsBetweenProfileOpens: "pace.min_seconds_between_profile_opens",
  minSecondsBetweenCaptures: "pace.min_seconds_between_captures",
  captureMaxPerHour: "pace.capture_max_per_hour",
} as const;

export type PaceSettings = {
  queueBatchSize: number;
  minSecondsBetweenProfileOpens: number;
  minSecondsBetweenCaptures: number;
  captureMaxPerHour: number;
};

export const PACE_DEFAULTS: PaceSettings = {
  /** How many queue items to surface at once before “next batch”. */
  queueBatchSize: 5,
  /** Minimum wait between opening profile links from the dashboard (you still click). */
  minSecondsBetweenProfileOpens: 60,
  /** Minimum spacing between successful extension captures (client + optional server advisory). */
  minSecondsBetweenCaptures: 45,
  /** Rolling 1h cap on capture ingests (server); extension mirrors via the same API. */
  captureMaxPerHour: 10,
};

const BOUNDS: Record<keyof PaceSettings, { min: number; max: number }> = {
  queueBatchSize: { min: 1, max: 25 },
  minSecondsBetweenProfileOpens: { min: 15, max: 600 },
  minSecondsBetweenCaptures: { min: 20, max: 600 },
  captureMaxPerHour: { min: 1, max: 40 },
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
