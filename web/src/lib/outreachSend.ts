import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import {
  getActiveOutreachCampaignId,
  getOutreachCampaign,
  listCampaignMembersForExtension,
} from "@/lib/outreachCampaigns";
import { nextRandomizedGapMs } from "@/lib/pace";

export const OUTREACH_SEND_KEYS = {
  enabled: "automation.linkedin_outreach_enabled",
  sendMode: "outreach.send_mode",
  minSecondsBetweenSends: "pace.min_seconds_between_sends",
  sendMaxPerDay: "pace.send_max_per_day",
  sendJitterPercent: "pace.send_jitter_percent",
  afterSendGapMs: "pace.after_send_gap_ms",
} as const;

export type OutreachSendMode = "manual_confirm" | "auto";

export type OutreachSendSettings = {
  enabled: boolean;
  sendMode: OutreachSendMode;
  minSecondsBetweenSends: number;
  sendMaxPerDay: number;
  sendJitterPercent: number;
};

const SEND_DEFAULTS: OutreachSendSettings = {
  enabled: false,
  sendMode: "auto",
  minSecondsBetweenSends: 120,
  sendMaxPerDay: 15,
  sendJitterPercent: 35,
};

const SEND_BOUNDS = {
  minSecondsBetweenSends: { min: 60, max: 900 },
  sendMaxPerDay: { min: 1, max: 40 },
  sendJitterPercent: { min: 0, max: 100 },
} as const;

function clampSend(
  key: keyof typeof SEND_BOUNDS,
  n: number,
): number {
  const { min, max } = SEND_BOUNDS[key];
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

export async function getOutreachSendSettings(): Promise<OutreachSendSettings> {
  const db = getDb();
  const keys = Object.values(OUTREACH_SEND_KEYS);
  const rows = await db.query.appSettings.findMany({
    where: inArray(appSettings.key, keys),
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const modeRaw = map.get(OUTREACH_SEND_KEYS.sendMode);
  const sendMode: OutreachSendMode =
    modeRaw === "auto" ? "auto" : "manual_confirm";
  return {
    enabled: parseBool(map.get(OUTREACH_SEND_KEYS.enabled), SEND_DEFAULTS.enabled),
    sendMode,
    minSecondsBetweenSends: clampSend(
      "minSecondsBetweenSends",
      parseStored(
        map.get(OUTREACH_SEND_KEYS.minSecondsBetweenSends),
        SEND_DEFAULTS.minSecondsBetweenSends,
      ),
    ),
    sendMaxPerDay: clampSend(
      "sendMaxPerDay",
      parseStored(
        map.get(OUTREACH_SEND_KEYS.sendMaxPerDay),
        SEND_DEFAULTS.sendMaxPerDay,
      ),
    ),
    sendJitterPercent: clampSend(
      "sendJitterPercent",
      parseStored(
        map.get(OUTREACH_SEND_KEYS.sendJitterPercent),
        SEND_DEFAULTS.sendJitterPercent,
      ),
    ),
  };
}

export type OutreachSendSettingsPatch = Partial<OutreachSendSettings>;

export async function updateOutreachSendSettings(
  patch: OutreachSendSettingsPatch,
): Promise<OutreachSendSettings> {
  const current = await getOutreachSendSettings();
  const next: OutreachSendSettings = { ...current, ...patch };
  if (patch.sendMode) {
    next.sendMode = patch.sendMode === "auto" ? "auto" : "manual_confirm";
  }
  next.minSecondsBetweenSends = clampSend(
    "minSecondsBetweenSends",
    next.minSecondsBetweenSends,
  );
  next.sendMaxPerDay = clampSend("sendMaxPerDay", next.sendMaxPerDay);
  next.sendJitterPercent = clampSend(
    "sendJitterPercent",
    next.sendJitterPercent,
  );

  await upsertAppSetting(
    OUTREACH_SEND_KEYS.enabled,
    next.enabled ? "1" : "0",
  );
  await upsertAppSetting(OUTREACH_SEND_KEYS.sendMode, next.sendMode);
  await upsertAppSetting(
    OUTREACH_SEND_KEYS.minSecondsBetweenSends,
    String(next.minSecondsBetweenSends),
  );
  await upsertAppSetting(
    OUTREACH_SEND_KEYS.sendMaxPerDay,
    String(next.sendMaxPerDay),
  );
  await upsertAppSetting(
    OUTREACH_SEND_KEYS.sendJitterPercent,
    String(next.sendJitterPercent),
  );
  return next;
}

export async function countSendsToday(): Promise<number> {
  const sqlite = (await import("@/db")).getSqlite();
  const dayStart = startOfLocalDay().getTime();
  const row = sqlite
    .prepare(
      `SELECT COUNT(*) AS c FROM outreach_send_log WHERE created_at >= ? AND outcome = 'sent'`,
    )
    .get(dayStart) as { c: number } | undefined;
  return row?.c ?? 0;
}

export async function sendRequiredGapMs(
  settings: OutreachSendSettings,
): Promise<number> {
  const minMs = settings.minSecondsBetweenSends * 1000;
  const db = getDb();
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, OUTREACH_SEND_KEYS.afterSendGapMs),
  });
  const stored = row?.value !== undefined ? Number(row.value) : NaN;
  const rolled =
    Number.isFinite(stored) && stored > 0 ? stored : minMs;
  return Math.max(rolled, minMs);
}

export async function rollSendGapAfterSuccess(
  settings: OutreachSendSettings,
): Promise<void> {
  const minMs = settings.minSecondsBetweenSends * 1000;
  const gap = nextRandomizedGapMs(minMs, settings.sendJitterPercent);
  await upsertAppSetting(
    OUTREACH_SEND_KEYS.afterSendGapMs,
    String(Math.max(gap, minMs)),
  );
}

export async function logOutreachSend(args: {
  campaignMemberId?: string | null;
  contactId: string;
  action: string;
  outcome: string;
  error?: string | null;
}): Promise<void> {
  const sqlite = (await import("@/db")).getSqlite();
  sqlite
    .prepare(
      `INSERT INTO outreach_send_log (id, campaign_member_id, contact_id, action, outcome, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      args.campaignMemberId ?? null,
      args.contactId,
      args.action,
      args.outcome,
      args.error ?? null,
      Date.now(),
    );
}

export type OutreachQueueNextItem = {
  memberId: string;
  contactId: string;
  fullName: string | null;
  linkedinUrl: string | null;
  draftOutreach: string | null;
  status: string;
  campaignId: string;
  campaignName: string;
  sendMode: OutreachSendMode;
};

export async function getNextOutreachSendItem(): Promise<
  | { item: OutreachQueueNextItem; waitMs: number }
  | { item: null; reason: string; waitMs?: number }
> {
  const settings = await getOutreachSendSettings();
  if (!settings.enabled) {
    return { item: null, reason: "linkedin_outreach_disabled" };
  }

  const sentToday = await countSendsToday();
  if (sentToday >= settings.sendMaxPerDay) {
    return { item: null, reason: "daily_send_cap" };
  }

  const waitMs = await sendRequiredGapMs(settings);
  const sqlite = (await import("@/db")).getSqlite();
  const last = sqlite
    .prepare(
      `SELECT created_at FROM outreach_send_log ORDER BY created_at DESC LIMIT 1`,
    )
    .get() as { created_at: number } | undefined;
  if (last?.created_at) {
    const elapsed = Date.now() - last.created_at;
    if (elapsed < waitMs) {
      return {
        item: null,
        reason: "pace_wait",
        waitMs: waitMs - elapsed,
      };
    }
  }

  const campaignId = await getActiveOutreachCampaignId();
  if (!campaignId) {
    return { item: null, reason: "no_active_campaign" };
  }

  const items = await listCampaignMembersForExtension(campaignId, 50, {
    onlyReady: true,
  });
  const ready = items.find((i) => i.status === "ready" && i.draftOutreach);
  if (!ready) {
    return { item: null, reason: "no_ready_members" };
  }

  const campaign = await getOutreachCampaign(campaignId);

  return {
    item: {
      memberId: ready.memberId,
      contactId: ready.contactId,
      fullName: ready.fullName ?? null,
      linkedinUrl: ready.linkedinUrl ?? null,
      draftOutreach: ready.draftOutreach ?? null,
      status: ready.status,
      campaignId,
      campaignName: campaign?.name ?? "Campaign",
      sendMode: settings.sendMode,
    },
    waitMs: 0,
  };
}
