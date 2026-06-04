import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { captureSessions, contacts, outreachCampaignMembers } from "@/db/schema";
import { readMemberIcpFromRow } from "@/lib/campaignMemberIcp";
import type {
  CampaignMemberIcpMatch,
  CampaignMemberIcpRecommendedAction,
} from "@/lib/campaignMemberIcpShared";

/** Same shape as `CampaignMemberRow` in outreachCampaigns (avoid import cycle). */
export type CampaignMemberRowLite = {
  member: typeof outreachCampaignMembers.$inferSelect;
  contact: typeof contacts.$inferSelect;
};

/** Latest LinkedIn profile capture depth (for outreach prep). */
export type ProfileDepth = "missing" | "thin" | "ok";

const DEPTH_ORDER: Record<ProfileDepth, number> = {
  missing: 0,
  thin: 1,
  ok: 2,
};

export function profileDepthAtLeast(
  current: ProfileDepth,
  minimum: ProfileDepth,
): boolean {
  return DEPTH_ORDER[current] >= DEPTH_ORDER[minimum];
}

/**
 * `json` = latest profile page `extracted_json`, or null if no profile capture.
 * - ok: About or Experience/Education bullets (usable for personalization).
 * - thin: capture exists with headline/name-like fields only.
 * - missing: no capture row.
 */
export function profileDepthFromLatestJson(
  json: Record<string, unknown> | null | undefined,
): ProfileDepth {
  if (!json || typeof json !== "object") return "missing";

  const about = typeof json.about === "string" ? json.about.trim() : "";
  const exp = Array.isArray(json.experienceBullets)
    ? json.experienceBullets.filter(
        (x) => typeof x === "string" && x.trim().length > 0,
      ).length
    : 0;
  const edu = Array.isArray(json.educationBullets)
    ? json.educationBullets.filter(
        (x) => typeof x === "string" && x.trim().length > 0,
      ).length
    : 0;

  if (about.length >= 40 || exp >= 1 || edu >= 1) return "ok";

  const loc =
    typeof json.location === "string" ? json.location.trim() : "";
  const deg =
    typeof json.connectionDegree === "string"
      ? json.connectionDegree.trim()
      : "";

  const hasCard =
    (typeof json.headline === "string" && json.headline.trim().length > 0) ||
    (typeof json.fullName === "string" && json.fullName.trim().length > 0) ||
    (typeof json.company === "string" && json.company.trim().length > 0) ||
    loc.length > 0 ||
    deg.length > 0;

  if (about.length > 0 || exp > 0 || edu > 0 || hasCard) return "thin";

  return "missing";
}

export type LatestProfileCapture = {
  capturedAt: Date;
  extractedJson: Record<string, unknown> | null;
};

/** Most recent profile-type capture per contact (batch). */
export async function loadLatestProfileCapturesByContactId(
  contactIds: string[],
): Promise<Map<string, LatestProfileCapture>> {
  const map = new Map<string, LatestProfileCapture>();
  const unique = [...new Set(contactIds.filter(Boolean))];
  if (unique.length === 0) return map;

  const db = getDb();
  const rows = await db
    .select()
    .from(captureSessions)
    .where(
      and(
        inArray(captureSessions.contactId, unique),
        eq(captureSessions.pageType, "profile"),
      ),
    )
    .orderBy(desc(captureSessions.capturedAt));

  for (const r of rows) {
    if (!r.contactId || map.has(r.contactId)) continue;
    const ej = r.extractedJson;
    map.set(r.contactId, {
      capturedAt: r.capturedAt,
      extractedJson:
        ej && typeof ej === "object" && !Array.isArray(ej)
          ? (ej as Record<string, unknown>)
          : null,
    });
  }
  return map;
}

export type EnrichedCampaignMember = CampaignMemberRowLite & {
  profileDepth: ProfileDepth;
  lastProfileCapturedAt: Date | null;
  icpMatch: CampaignMemberIcpMatch | null;
  icpRationale: string | null;
  icpRecommendedAction: CampaignMemberIcpRecommendedAction | null;
  icpCheckedAt: Date | null;
};

/** Still in the outreach pipeline (not marked sent/skipped after manual LinkedIn send). */
export function memberPipelineOpen(m: EnrichedCampaignMember): boolean {
  const st = m.member.status;
  return st !== "sent" && st !== "skipped";
}

export async function enrichCampaignMembers(
  rows: CampaignMemberRowLite[],
): Promise<EnrichedCampaignMember[]> {
  const caps = await loadLatestProfileCapturesByContactId(
    rows.map((r) => r.contact.id),
  );
  return rows.map((row) => {
    const cap = caps.get(row.contact.id);
    let depth: ProfileDepth = cap
      ? profileDepthFromLatestJson(cap.extractedJson)
      : "missing";
    // A profile-type capture row means the page was captured; empty JSON / DOM drift
    // should still count as at least "thin" (not "missing").
    if (cap && depth === "missing") depth = "thin";
    const icp = readMemberIcpFromRow(row.member);
    return {
      ...row,
      profileDepth: depth,
      lastProfileCapturedAt: cap?.capturedAt ?? null,
      ...icp,
    };
  });
}

export type MemberReadinessFilter =
  | "all"
  | "need_profile"
  | "thin_profile"
  | "profile_ok"
  | "need_draft"
  | "has_draft"
  | "extension_ready"
  | "done"
  | "needs_messaging_reply"
  | "needs_thread_capture"
  | "icp_strong"
  | "icp_partial"
  | "icp_weak"
  | "icp_unknown"
  | "icp_unchecked";

export type MemberReadinessFilterContext = {
  messagingByContactId?: Map<
    string,
    import("@/lib/messagingContext").MergedMessagingThread
  >;
  outreachExtras?: Map<
    string,
    import("@/lib/campaignMemberOutreach").MemberOutreachExtras
  >;
};

export function parseMemberReadinessFilter(
  raw: string | undefined,
): MemberReadinessFilter {
  const allowed: MemberReadinessFilter[] = [
    "all",
    "need_profile",
    "thin_profile",
    "profile_ok",
    "need_draft",
    "has_draft",
    "extension_ready",
    "done",
    "needs_messaging_reply",
    "needs_thread_capture",
    "icp_strong",
    "icp_partial",
    "icp_weak",
    "icp_unknown",
    "icp_unchecked",
  ];
  if (raw && allowed.includes(raw as MemberReadinessFilter)) {
    return raw as MemberReadinessFilter;
  }
  return "all";
}

export function enrichedMemberMatchesFilter(
  row: EnrichedCampaignMember,
  filter: MemberReadinessFilter,
  ctx?: MemberReadinessFilterContext,
): boolean {
  if (filter === "all") return true;
  const draft = (row.member.draftOutreach ?? "").trim();
  const hasDraft = draft.length > 0;
  const st = row.member.status;
  const open = memberPipelineOpen(row);

  switch (filter) {
    case "need_profile":
      return open && row.profileDepth === "missing";
    case "thin_profile":
      return open && row.profileDepth === "thin";
    case "profile_ok":
      return open && row.profileDepth === "ok";
    case "need_draft":
      return open && st === "draft" && !hasDraft;
    case "has_draft":
      return open && hasDraft;
    case "extension_ready":
      return open && st === "ready";
    case "done":
      return st === "sent" || st === "skipped";
    case "needs_messaging_reply": {
      if (st !== "sent") return false;
      const thread = ctx?.messagingByContactId?.get(row.contact.id) ?? null;
      const extras = ctx?.outreachExtras?.get(row.member.id);
      if (extras?.messageReplyOutcome === "replied") return false;
      if (thread?.replyState.needsReply) return true;
      if (thread?.replyState.lastFrom === "them") return true;
      return false;
    }
    case "needs_thread_capture":
      return st === "sent" && !ctx?.messagingByContactId?.get(row.contact.id);
    case "icp_strong":
      return row.icpMatch === "strong";
    case "icp_partial":
      return row.icpMatch === "partial";
    case "icp_weak":
      return row.icpMatch === "weak";
    case "icp_unknown":
      return row.icpMatch === "unknown";
    case "icp_unchecked":
      return !row.icpCheckedAt;
    default:
      return true;
  }
}

/** Next profile to open for capture (missing first, then thin). */
export function pickNextProfileCaptureTarget(
  rows: EnrichedCampaignMember[],
): { profileUrl: string; fullName: string | null; memberId: string } | null {
  const sorted = [...rows].sort((a, b) => {
    if (a.profileDepth !== b.profileDepth) {
      return DEPTH_ORDER[a.profileDepth] - DEPTH_ORDER[b.profileDepth];
    }
    return b.member.updatedAt.getTime() - a.member.updatedAt.getTime();
  });
  for (const m of sorted) {
    if (!memberPipelineOpen(m)) continue;
    if (m.profileDepth === "ok") continue;
    const profileUrl = m.contact.linkedinUrlCanonical?.trim();
    if (!profileUrl) continue;
    return {
      profileUrl,
      fullName: m.contact.fullName,
      memberId: m.member.id,
    };
  }
  return null;
}

export function countProfileDepths(rows: EnrichedCampaignMember[]): {
  missing: number;
  thin: number;
  ok: number;
} {
  let missing = 0;
  let thin = 0;
  let ok = 0;
  for (const r of rows) {
    if (!memberPipelineOpen(r)) continue;
    if (r.profileDepth === "missing") missing += 1;
    else if (r.profileDepth === "thin") thin += 1;
    else ok += 1;
  }
  return { missing, thin, ok };
}

export function readinessFilterCounts(
  rows: EnrichedCampaignMember[],
  ctx?: MemberReadinessFilterContext,
): Record<MemberReadinessFilter, number> {
  return {
    all: rows.length,
    need_profile: rows.filter(
      (m) => memberPipelineOpen(m) && m.profileDepth === "missing",
    ).length,
    thin_profile: rows.filter(
      (m) => memberPipelineOpen(m) && m.profileDepth === "thin",
    ).length,
    profile_ok: rows.filter(
      (m) => memberPipelineOpen(m) && m.profileDepth === "ok",
    ).length,
    need_draft: rows.filter(
      (m) =>
        memberPipelineOpen(m) &&
        m.member.status === "draft" &&
        !(m.member.draftOutreach ?? "").trim().length,
    ).length,
    has_draft: rows.filter(
      (m) =>
        memberPipelineOpen(m) &&
        (m.member.draftOutreach ?? "").trim().length > 0,
    ).length,
    extension_ready: rows.filter(
      (m) => memberPipelineOpen(m) && m.member.status === "ready",
    ).length,
    done: rows.filter(
      (m) =>
        m.member.status === "sent" || m.member.status === "skipped",
    ).length,
    needs_messaging_reply: rows.filter((m) =>
      enrichedMemberMatchesFilter(m, "needs_messaging_reply", ctx),
    ).length,
    needs_thread_capture: rows.filter((m) =>
      enrichedMemberMatchesFilter(m, "needs_thread_capture", ctx),
    ).length,
    icp_strong: rows.filter((m) => m.icpMatch === "strong").length,
    icp_partial: rows.filter((m) => m.icpMatch === "partial").length,
    icp_weak: rows.filter((m) => m.icpMatch === "weak").length,
    icp_unknown: rows.filter((m) => m.icpMatch === "unknown").length,
    icp_unchecked: rows.filter((m) => !m.icpCheckedAt).length,
  };
}
