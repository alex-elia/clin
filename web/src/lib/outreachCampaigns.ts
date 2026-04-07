import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  loadLatestProfileCapturesByContactId,
  profileDepthAtLeast,
  profileDepthFromLatestJson,
  type ProfileDepth,
} from "@/lib/campaignMemberReadiness";
import { listContacts } from "@/lib/queries";
import { getDb } from "@/db";
import {
  appSettings,
  contacts,
  outreachCampaignMembers,
  outreachCampaigns,
} from "@/db/schema";

const ACTIVE_CAMPAIGN_KEY = "extension.active_outreach_campaign_id";
const CAPTURE_TARGET_CAMPAIGN_KEY = "extension.capture_target_campaign_id";

async function upsertSetting(key: string, value: string) {
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

export async function getActiveOutreachCampaignId(): Promise<string | null> {
  const db = getDb();
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, ACTIVE_CAMPAIGN_KEY),
  });
  const v = row?.value?.trim();
  return v || null;
}

export async function setActiveOutreachCampaignId(
  campaignId: string | null,
): Promise<void> {
  if (!campaignId) {
    const db = getDb();
    await db.delete(appSettings).where(eq(appSettings.key, ACTIVE_CAMPAIGN_KEY));
    return;
  }
  await upsertSetting(ACTIVE_CAMPAIGN_KEY, campaignId);
}

export async function getCaptureTargetCampaignId(): Promise<string | null> {
  const db = getDb();
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, CAPTURE_TARGET_CAMPAIGN_KEY),
  });
  const v = row?.value?.trim();
  return v || null;
}

export async function setCaptureTargetCampaignId(
  campaignId: string | null,
): Promise<void> {
  if (!campaignId) {
    const db = getDb();
    await db
      .delete(appSettings)
      .where(eq(appSettings.key, CAPTURE_TARGET_CAMPAIGN_KEY));
    return;
  }
  await upsertSetting(CAPTURE_TARGET_CAMPAIGN_KEY, campaignId);
}

/** After ingest: add imported contacts to a campaign when the extension sent this id. */
export async function attachImportedContactsToCampaign(
  outreachCampaignId: string | undefined | null,
  contactIds: string[],
): Promise<{
  attachedToCampaignId: string | null;
  membersAdded: number;
  campaignName: string | null;
}> {
  const cid = outreachCampaignId?.trim();
  if (!cid || contactIds.length === 0) {
    return { attachedToCampaignId: null, membersAdded: 0, campaignName: null };
  }
  const camp = await getOutreachCampaign(cid);
  if (!camp) {
    return { attachedToCampaignId: null, membersAdded: 0, campaignName: null };
  }
  const { added } = await addContactsToCampaign(cid, contactIds);
  return {
    attachedToCampaignId: cid,
    membersAdded: added,
    campaignName: camp.name,
  };
}

export async function findMemberByCampaignAndContact(
  campaignId: string,
  contactId: string,
) {
  const db = getDb();
  return db.query.outreachCampaignMembers.findFirst({
    where: and(
      eq(outreachCampaignMembers.campaignId, campaignId),
      eq(outreachCampaignMembers.contactId, contactId),
    ),
  });
}

/** Drops the campaign membership row only; the contact row is untouched. */
export async function removeMemberFromCampaign(
  campaignId: string,
  memberId: string,
): Promise<boolean> {
  const db = getDb();
  const row = await db.query.outreachCampaignMembers.findFirst({
    where: eq(outreachCampaignMembers.id, memberId),
  });
  if (!row || row.campaignId !== campaignId) return false;
  await db
    .delete(outreachCampaignMembers)
    .where(eq(outreachCampaignMembers.id, memberId));
  const now = new Date();
  await db
    .update(outreachCampaigns)
    .set({ updatedAt: now })
    .where(eq(outreachCampaigns.id, campaignId));
  return true;
}

export async function listOutreachCampaigns() {
  const db = getDb();
  return db.query.outreachCampaigns.findMany({
    orderBy: [desc(outreachCampaigns.updatedAt)],
  });
}

export async function getOutreachCampaign(id: string) {
  const db = getDb();
  return db.query.outreachCampaigns.findFirst({
    where: eq(outreachCampaigns.id, id),
  });
}

export type CampaignMemberRow = {
  member: typeof outreachCampaignMembers.$inferSelect;
  contact: typeof contacts.$inferSelect;
};

export async function listCampaignMembers(
  campaignId: string,
): Promise<CampaignMemberRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(outreachCampaignMembers)
    .innerJoin(contacts, eq(outreachCampaignMembers.contactId, contacts.id))
    .where(eq(outreachCampaignMembers.campaignId, campaignId))
    .orderBy(desc(outreachCampaignMembers.updatedAt));

  return rows.map((r) => ({
    member: r.outreach_campaign_members,
    contact: r.contacts,
  }));
}

/** Next items for extension: has a draft, not yet sent/skipped. */
export async function listCampaignMembersForExtension(
  campaignId: string,
  limit: number,
  opts?: { onlyReady?: boolean },
) {
  const db = getDb();
  const lim = Math.min(50, Math.max(1, limit));
  const onlyReady = opts?.onlyReady === true;

  const statusFilter = onlyReady
    ? eq(outreachCampaignMembers.status, "ready")
    : and(
        ne(outreachCampaignMembers.status, "sent"),
        ne(outreachCampaignMembers.status, "skipped"),
      );

  const rows = await db
    .select()
    .from(outreachCampaignMembers)
    .innerJoin(contacts, eq(outreachCampaignMembers.contactId, contacts.id))
    .where(
      and(eq(outreachCampaignMembers.campaignId, campaignId), statusFilter),
    )
    .orderBy(
      sql`CASE WHEN ${outreachCampaignMembers.status} = 'ready' THEN 0 ELSE 1 END`,
      desc(outreachCampaignMembers.updatedAt),
    )
    .limit(lim);

  return rows
    .filter((r) => (r.outreach_campaign_members.draftOutreach ?? "").trim().length > 0)
    .map((r) => ({
      memberId: r.outreach_campaign_members.id,
      contactId: r.contacts.id,
      fullName: r.contacts.fullName,
      headline: r.contacts.headline,
      company: r.contacts.company,
      linkedinUrl: r.contacts.linkedinUrlCanonical,
      draftOutreach: r.outreach_campaign_members.draftOutreach ?? "",
      status: r.outreach_campaign_members.status,
    }));
}

export async function updateMemberStatus(
  memberId: string,
  status: "draft" | "ready" | "sent" | "skipped",
) {
  const db = getDb();
  const now = new Date();
  await db
    .update(outreachCampaignMembers)
    .set({ status, updatedAt: now })
    .where(eq(outreachCampaignMembers.id, memberId));
}

export async function updateMemberDraft(memberId: string, draft: string | null) {
  const db = getDb();
  const now = new Date();
  await db
    .update(outreachCampaignMembers)
    .set({ draftOutreach: draft, updatedAt: now })
    .where(eq(outreachCampaignMembers.id, memberId));
}

export async function findMemberById(memberId: string) {
  const db = getDb();
  return db.query.outreachCampaignMembers.findFirst({
    where: eq(outreachCampaignMembers.id, memberId),
  });
}

export async function listMembersNeedingDraft(
  campaignId: string,
  limit: number,
  opts?: { minProfileDepth?: ProfileDepth },
) {
  const db = getDb();
  const lim = Math.min(25, Math.max(1, limit));
  const rows = await db.query.outreachCampaignMembers.findMany({
    where: and(
      eq(outreachCampaignMembers.campaignId, campaignId),
      eq(outreachCampaignMembers.status, "draft"),
    ),
    limit: lim * 8,
  });
  const emptyDraft = rows.filter((r) => !(r.draftOutreach ?? "").trim());
  const minDepth = opts?.minProfileDepth;
  if (!minDepth || minDepth === "missing") {
    return emptyDraft.slice(0, lim);
  }
  const caps = await loadLatestProfileCapturesByContactId(
    emptyDraft.map((r) => r.contactId),
  );
  const out: typeof emptyDraft = [];
  for (const m of emptyDraft) {
    const cap = caps.get(m.contactId);
    const depth = cap
      ? profileDepthFromLatestJson(cap.extractedJson)
      : "missing";
    if (!profileDepthAtLeast(depth, minDepth)) continue;
    out.push(m);
    if (out.length >= lim) break;
  }
  return out;
}

export async function addContactsToCampaign(
  campaignId: string,
  contactIds: string[],
): Promise<{ added: number; skipped: number }> {
  const db = getDb();
  const unique = [...new Set(contactIds.filter(Boolean))];
  if (unique.length === 0) return { added: 0, skipped: 0 };

  const existing = await db.query.outreachCampaignMembers.findMany({
    where: and(
      eq(outreachCampaignMembers.campaignId, campaignId),
      inArray(outreachCampaignMembers.contactId, unique),
    ),
  });
  const have = new Set(existing.map((e) => e.contactId));
  const now = new Date();
  let added = 0;
  let skipped = 0;
  for (const contactId of unique) {
    if (have.has(contactId)) {
      skipped += 1;
      continue;
    }
    const c = await db.query.contacts.findFirst({
      where: eq(contacts.id, contactId),
    });
    if (!c) {
      skipped += 1;
      continue;
    }
    await db.insert(outreachCampaignMembers).values({
      id: crypto.randomUUID(),
      campaignId,
      contactId,
      draftOutreach: null,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    added += 1;
  }
  await db
    .update(outreachCampaigns)
    .set({ updatedAt: now })
    .where(eq(outreachCampaigns.id, campaignId));
  return { added, skipped };
}

export async function createOutreachCampaign(
  name: string,
  contextText: string,
  opts?: {
    writerInstructions?: string | null;
    systemPromptOverride?: string | null;
  },
) {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(outreachCampaigns).values({
    id,
    name: name.trim(),
    contextText: contextText.trim(),
    writerInstructions: opts?.writerInstructions?.trim()
      ? opts.writerInstructions.trim()
      : null,
    systemPromptOverride: opts?.systemPromptOverride?.trim()
      ? opts.systemPromptOverride.trim()
      : null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateOutreachCampaign(
  id: string,
  patch: {
    name?: string;
    contextText?: string;
    writerInstructions?: string | null;
    systemPromptOverride?: string | null;
  },
) {
  const db = getDb();
  const now = new Date();
  await db
    .update(outreachCampaigns)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.contextText !== undefined
        ? { contextText: patch.contextText.trim() }
        : {}),
      ...(patch.writerInstructions !== undefined
        ? {
            writerInstructions:
              patch.writerInstructions === null ||
              patch.writerInstructions.trim() === ""
                ? null
                : patch.writerInstructions.trim(),
          }
        : {}),
      ...(patch.systemPromptOverride !== undefined
        ? {
            systemPromptOverride:
              patch.systemPromptOverride === null ||
              patch.systemPromptOverride.trim() === ""
                ? null
                : patch.systemPromptOverride.trim(),
          }
        : {}),
      updatedAt: now,
    })
    .where(eq(outreachCampaigns.id, id));
}

export async function addContactsFromSegment(
  campaignId: string,
  segment: string,
  limit: number,
) {
  const lim = Math.min(100, Math.max(1, limit));
  const rows = await listContacts({ segment, limit: lim, sort: "updated" });
  return addContactsToCampaign(
    campaignId,
    rows.map((c) => c.id),
  );
}
