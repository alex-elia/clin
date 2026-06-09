import { randomInt, randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings, automationLog, contacts } from "@/db/schema";
import { pickNextEnrichContact } from "@/lib/enrichment";
import { tryUpdateHygieneVisitAt } from "@/lib/contactSqlExtras";
import { nextRandomizedGapMs } from "@/lib/pace";

export const AUTOMATION_KEYS = {
  enabled: "automation.enabled",
  /** When false, extension refuses list import + enrich pipeline. */
  connectionsSprintEnabled: "automation.connections_sprint_enabled",
  /** After a list import, extension may open profiles automatically (same daily cap). */
  autoEnrichAfterList: "automation.auto_enrich_after_list",
  /** After profile capture in enrich pipeline, try messaging thread capture. */
  autoCaptureMessagingInEnrich: "automation.auto_capture_messaging_in_enrich",
  /** After profile capture in enrich pipeline, capture recent posts. */
  autoCapturePostsInEnrich: "automation.auto_capture_posts_in_enrich",
  maxPerDay: "automation.max_per_day",
  minGapSeconds: "automation.min_gap_seconds",
  maxGapSeconds: "automation.max_gap_seconds",
  jitterPercent: "automation.jitter_percent",
} as const;

export type AutomationSettings = {
  enabled: boolean;
  connectionsSprintEnabled: boolean;
  autoEnrichAfterList: boolean;
  autoCaptureMessagingInEnrich: boolean;
  autoCapturePostsInEnrich: boolean;
  maxPerDay: number;
  minGapSeconds: number;
  maxGapSeconds: number;
  jitterPercent: number;
};

const DEFAULTS: AutomationSettings = {
  enabled: true,
  connectionsSprintEnabled: true,
  autoEnrichAfterList: true,
  autoCaptureMessagingInEnrich: true,
  autoCapturePostsInEnrich: true,
  maxPerDay: 15,
  minGapSeconds: 75,
  maxGapSeconds: 180,
  jitterPercent: 35,
};

const BOUNDS = {
  maxPerDay: { min: 1, max: 50 },
  minGapSeconds: { min: 30, max: 600 },
  maxGapSeconds: { min: 60, max: 900 },
  jitterPercent: { min: 0, max: 100 },
} as const;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
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

export async function countHygieneVisitsToday(): Promise<number> {
  const db = getDb();
  const start = startOfLocalDay();
  const [row] = await db
    .select({ n: count() })
    .from(automationLog)
    .where(
      and(
        eq(automationLog.kind, "hygiene"),
        gte(automationLog.createdAt, start),
        inArray(automationLog.outcome, ["ok", "skip"]),
      ),
    );
  return row?.n ?? 0;
}

/** Random delay before opening the next profile (humanized batch spacing). */
export function hygieneBetweenProfileMs(settings: AutomationSettings): number {
  const lo = settings.minGapSeconds;
  const hi = Math.max(lo, settings.maxGapSeconds);
  const sec = lo + randomInt(0, hi - lo + 1);
  const ms = sec * 1000;
  return nextRandomizedGapMs(ms, settings.jitterPercent);
}

const PRIORITY_SEGMENTS = ["remove_candidate", "ghost", "dormant"] as const;

/** Prefer list imports that still need a profile page capture. */
export async function pickNextHygieneContact(): Promise<
  typeof contacts.$inferSelect | null
> {
  const enrich = await pickNextEnrichContact();
  if (enrich) return enrich;

  const db = getDb();
  const [fromPriority] = await db
    .select()
    .from(contacts)
    .where(inArray(contacts.segment, [...PRIORITY_SEGMENTS]))
    .orderBy(desc(contacts.cleanupScore), asc(contacts.lastSeenAt))
    .limit(1);

  if (fromPriority) return fromPriority;

  const [any] = await db
    .select()
    .from(contacts)
    .orderBy(desc(contacts.cleanupScore), asc(contacts.lastSeenAt))
    .limit(1);

  return any ?? null;
}

export async function getAutomationSettings(): Promise<AutomationSettings> {
  const db = getDb();
  const keys = Object.values(AUTOMATION_KEYS);
  const rows = await db.query.appSettings.findMany({
    where: inArray(appSettings.key, keys),
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const maxPerDay = clamp(
    parseStored(map.get(AUTOMATION_KEYS.maxPerDay), DEFAULTS.maxPerDay),
    BOUNDS.maxPerDay.min,
    BOUNDS.maxPerDay.max,
  );
  const minGap = clamp(
    parseStored(map.get(AUTOMATION_KEYS.minGapSeconds), DEFAULTS.minGapSeconds),
    BOUNDS.minGapSeconds.min,
    BOUNDS.minGapSeconds.max,
  );
  let maxGap = clamp(
    parseStored(map.get(AUTOMATION_KEYS.maxGapSeconds), DEFAULTS.maxGapSeconds),
    BOUNDS.maxGapSeconds.min,
    BOUNDS.maxGapSeconds.max,
  );
  if (maxGap < minGap) maxGap = minGap;

  return {
    enabled: parseBool(map.get(AUTOMATION_KEYS.enabled), DEFAULTS.enabled),
    connectionsSprintEnabled: parseBool(
      map.get(AUTOMATION_KEYS.connectionsSprintEnabled),
      DEFAULTS.connectionsSprintEnabled,
    ),
    autoEnrichAfterList: parseBool(
      map.get(AUTOMATION_KEYS.autoEnrichAfterList),
      DEFAULTS.autoEnrichAfterList,
    ),
    autoCaptureMessagingInEnrich: parseBool(
      map.get(AUTOMATION_KEYS.autoCaptureMessagingInEnrich),
      DEFAULTS.autoCaptureMessagingInEnrich,
    ),
    autoCapturePostsInEnrich: parseBool(
      map.get(AUTOMATION_KEYS.autoCapturePostsInEnrich),
      DEFAULTS.autoCapturePostsInEnrich,
    ),
    maxPerDay,
    minGapSeconds: minGap,
    maxGapSeconds: maxGap,
    jitterPercent: clamp(
      parseStored(map.get(AUTOMATION_KEYS.jitterPercent), DEFAULTS.jitterPercent),
      BOUNDS.jitterPercent.min,
      BOUNDS.jitterPercent.max,
    ),
  };
}

export type AutomationSettingsPatch = Partial<{
  enabled: boolean;
  connectionsSprintEnabled: boolean;
  autoEnrichAfterList: boolean;
  autoCaptureMessagingInEnrich: boolean;
  autoCapturePostsInEnrich: boolean;
  maxPerDay: number;
  minGapSeconds: number;
  maxGapSeconds: number;
  jitterPercent: number;
}>;

export async function updateAutomationSettings(
  patch: AutomationSettingsPatch,
): Promise<AutomationSettings> {
  const current = await getAutomationSettings();
  const next: AutomationSettings = { ...current };
  if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
  if (typeof patch.connectionsSprintEnabled === "boolean") {
    next.connectionsSprintEnabled = patch.connectionsSprintEnabled;
  }
  if (typeof patch.autoEnrichAfterList === "boolean") {
    next.autoEnrichAfterList = patch.autoEnrichAfterList;
  }
  if (typeof patch.autoCaptureMessagingInEnrich === "boolean") {
    next.autoCaptureMessagingInEnrich = patch.autoCaptureMessagingInEnrich;
  }
  if (typeof patch.autoCapturePostsInEnrich === "boolean") {
    next.autoCapturePostsInEnrich = patch.autoCapturePostsInEnrich;
  }
  if (typeof patch.maxPerDay === "number" && Number.isFinite(patch.maxPerDay)) {
    next.maxPerDay = clamp(patch.maxPerDay, BOUNDS.maxPerDay.min, BOUNDS.maxPerDay.max);
  }
  if (
    typeof patch.minGapSeconds === "number" &&
    Number.isFinite(patch.minGapSeconds)
  ) {
    next.minGapSeconds = clamp(
      patch.minGapSeconds,
      BOUNDS.minGapSeconds.min,
      BOUNDS.minGapSeconds.max,
    );
  }
  if (
    typeof patch.maxGapSeconds === "number" &&
    Number.isFinite(patch.maxGapSeconds)
  ) {
    next.maxGapSeconds = clamp(
      patch.maxGapSeconds,
      BOUNDS.maxGapSeconds.min,
      BOUNDS.maxGapSeconds.max,
    );
  }
  if (next.maxGapSeconds < next.minGapSeconds) next.maxGapSeconds = next.minGapSeconds;
  if (
    typeof patch.jitterPercent === "number" &&
    Number.isFinite(patch.jitterPercent)
  ) {
    next.jitterPercent = clamp(
      patch.jitterPercent,
      BOUNDS.jitterPercent.min,
      BOUNDS.jitterPercent.max,
    );
  }

  await upsertAppSetting(
    AUTOMATION_KEYS.enabled,
    next.enabled ? "1" : "0",
  );
  await upsertAppSetting(
    AUTOMATION_KEYS.connectionsSprintEnabled,
    next.connectionsSprintEnabled ? "1" : "0",
  );
  await upsertAppSetting(
    AUTOMATION_KEYS.autoEnrichAfterList,
    next.autoEnrichAfterList ? "1" : "0",
  );
  await upsertAppSetting(
    AUTOMATION_KEYS.autoCaptureMessagingInEnrich,
    next.autoCaptureMessagingInEnrich ? "1" : "0",
  );
  await upsertAppSetting(
    AUTOMATION_KEYS.autoCapturePostsInEnrich,
    next.autoCapturePostsInEnrich ? "1" : "0",
  );
  await upsertAppSetting(AUTOMATION_KEYS.maxPerDay, String(next.maxPerDay));
  await upsertAppSetting(
    AUTOMATION_KEYS.minGapSeconds,
    String(next.minGapSeconds),
  );
  await upsertAppSetting(
    AUTOMATION_KEYS.maxGapSeconds,
    String(next.maxGapSeconds),
  );
  await upsertAppSetting(
    AUTOMATION_KEYS.jitterPercent,
    String(next.jitterPercent),
  );

  return next;
}

export function ackHygieneVisitSync(opts: {
  contactId: string;
  outcome: "ok" | "skip" | "error";
}): void {
  const db = getDb();
  const now = new Date();
  const id = randomUUID();
  db.transaction((tx) => {
    tx.insert(automationLog).values({
      id,
      contactId: opts.contactId,
      kind: "hygiene",
      outcome: opts.outcome,
      createdAt: now,
    }).run();
  });
  if (opts.outcome === "ok" || opts.outcome === "skip") {
    tryUpdateHygieneVisitAt(opts.contactId, now.getTime());
  }
}
