import { getSqlite } from "@/db";
import {
  countSendsToday,
  getOutreachSendSettings,
  getNextOutreachSendItem,
} from "@/lib/outreachSend";

export type MemberOutreachExtras = {
  messageSentAt: Date | null;
  messageReplyOutcome: string;
  messageOutcomeNote: string | null;
};

export type CampaignOutreachPanel = {
  enabled: boolean;
  sendMode: string;
  sendsToday: number;
  sendMaxPerDay: number;
  readyCount: number;
  nextReason: string | null;
  recentSends: {
    contactName: string | null;
    outcome: string;
    at: Date;
    error: string | null;
  }[];
};

export async function loadMemberOutreachExtras(
  memberIds: string[],
): Promise<Map<string, MemberOutreachExtras>> {
  const map = new Map<string, MemberOutreachExtras>();
  if (memberIds.length === 0) return map;

  const sqlite = getSqlite();
  const placeholders = memberIds.map(() => "?").join(", ");
  const rows = sqlite
    .prepare(
      `SELECT id, message_sent_at, message_reply_outcome, message_outcome_note
       FROM outreach_campaign_members WHERE id IN (${placeholders})`,
    )
    .all(...memberIds) as {
    id: string;
    message_sent_at: number | null;
    message_reply_outcome: string | null;
    message_outcome_note: string | null;
  }[];

  for (const r of rows) {
    map.set(r.id, {
      messageSentAt:
        r.message_sent_at != null ? new Date(r.message_sent_at) : null,
      messageReplyOutcome: r.message_reply_outcome ?? "unknown",
      messageOutcomeNote: r.message_outcome_note ?? null,
    });
  }
  return map;
}

export async function setMemberMessageSentAt(memberId: string): Promise<void> {
  const sqlite = getSqlite();
  sqlite
    .prepare(
      `UPDATE outreach_campaign_members SET message_sent_at = ? WHERE id = ?`,
    )
    .run(Date.now(), memberId);
}

export async function updateMemberReplyOutcome(
  memberId: string,
  replyOutcome: string,
  note: string | null,
): Promise<void> {
  const sqlite = getSqlite();
  sqlite
    .prepare(
      `UPDATE outreach_campaign_members SET message_reply_outcome = ?, message_outcome_note = ? WHERE id = ?`,
    )
    .run(replyOutcome, note, memberId);
}

export function outreachNextReasonLabel(reason: string | null): string {
  switch (reason) {
    case null:
      return "Next ready member available for extension run.";
    case "linkedin_outreach_disabled":
      return "Outreach runner off — enable in Settings.";
    case "not_active_campaign":
      return "Set this campaign active for extension to queue sends here.";
    case "daily_send_cap":
      return "Daily send cap reached.";
    case "pace_wait":
      return "Waiting for send pace gap.";
    case "no_ready_members":
      return "No ready members with drafts.";
    case "no_active_campaign":
      return "No active campaign selected.";
    default:
      return reason;
  }
}

export async function getCampaignOutreachPanel(
  campaignId: string,
  isActive: boolean,
): Promise<CampaignOutreachPanel> {
  const settings = await getOutreachSendSettings();
  const sendsToday = await countSendsToday();
  const sqlite = getSqlite();

  const readyRow = sqlite
    .prepare(
      `SELECT COUNT(*) AS c FROM outreach_campaign_members WHERE campaign_id = ? AND status = 'ready'`,
    )
    .get(campaignId) as { c: number };
  const readyCount = readyRow?.c ?? 0;

  let nextReason: string | null = null;
  if (isActive && settings.enabled) {
    const next = await getNextOutreachSendItem();
    if (!next.item) nextReason = next.reason;
  } else if (!settings.enabled) {
    nextReason = "linkedin_outreach_disabled";
  } else if (!isActive) {
    nextReason = "not_active_campaign";
  }

  const logs = sqlite
    .prepare(
      `SELECT l.outcome, l.error, l.created_at, c.full_name
       FROM outreach_send_log l
       INNER JOIN outreach_campaign_members m ON m.id = l.campaign_member_id
       LEFT JOIN contacts c ON c.id = l.contact_id
       WHERE m.campaign_id = ?
       ORDER BY l.created_at DESC
       LIMIT 8`,
    )
    .all(campaignId) as {
    outcome: string;
    error: string | null;
    created_at: number;
    full_name: string | null;
  }[];

  return {
    enabled: settings.enabled,
    sendMode: settings.sendMode,
    sendsToday,
    sendMaxPerDay: settings.sendMaxPerDay,
    readyCount,
    nextReason,
    recentSends: logs.map((l) => ({
      contactName: l.full_name,
      outcome: l.outcome,
      at: new Date(l.created_at),
      error: l.error,
    })),
  };
}
