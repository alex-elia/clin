import { and, eq } from "drizzle-orm";
import type { getDb } from "@/db";
import { contacts, outreachCampaignMembers } from "@/db/schema";
import { canonicalizeLinkedInUrl } from "@/lib/url";

type Db = ReturnType<typeof getDb>;
type ContactRow = typeof contacts.$inferSelect;

export type MessagingCaptureContext = {
  outreachCampaignId?: string;
  outreachMemberId?: string;
  expectedParticipantProfileUrl?: string;
};

function normalizeParticipantName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function profileVanity(canonical: string | null | undefined): string | null {
  if (!canonical?.trim()) return null;
  try {
    const parts = new URL(canonical.trim()).pathname.split("/").filter(Boolean);
    if (parts[0] === "in" && parts[1]) {
      return decodeURIComponent(parts[1]).toLowerCase();
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function memberContact(
  db: Db,
  memberId: string,
): Promise<ContactRow | undefined> {
  const member = await db.query.outreachCampaignMembers.findFirst({
    where: eq(outreachCampaignMembers.id, memberId),
  });
  if (!member) return undefined;
  return db.query.contacts.findFirst({
    where: eq(contacts.id, member.contactId),
  });
}

async function campaignMemberByContactId(
  db: Db,
  campaignId: string,
  contactId: string,
): Promise<boolean> {
  const row = await db.query.outreachCampaignMembers.findFirst({
    where: and(
      eq(outreachCampaignMembers.campaignId, campaignId),
      eq(outreachCampaignMembers.contactId, contactId),
    ),
  });
  return Boolean(row);
}

async function listCampaignMemberContacts(
  db: Db,
  campaignId: string,
): Promise<ContactRow[]> {
  const rows = await db
    .select({ contact: contacts })
    .from(outreachCampaignMembers)
    .innerJoin(contacts, eq(outreachCampaignMembers.contactId, contacts.id))
    .where(eq(outreachCampaignMembers.campaignId, campaignId));
  return rows.map((r) => r.contact);
}

/**
 * Pick the campaign member contact a messaging capture should attach to.
 * Prefers explicit outreach context over scraped participant URL (LinkedIn often
 * returns a different /in/ slug than the campaign member row).
 */
export async function resolveMessagingCaptureTargetContact(
  db: Db,
  input: MessagingCaptureContext & {
    scrapedProfileUrl: string;
    participantName?: string;
  },
): Promise<{ contact: ContactRow | undefined; resolvedVia: string | null }> {
  const scrapedCanonical = canonicalizeLinkedInUrl(input.scrapedProfileUrl);
  const expectedCanonical = input.expectedParticipantProfileUrl
    ? canonicalizeLinkedInUrl(input.expectedParticipantProfileUrl)
    : null;
  const nameNorm = normalizeParticipantName(input.participantName);

  if (input.outreachMemberId) {
    const contact = await memberContact(db, input.outreachMemberId);
    if (contact) {
      return { contact, resolvedVia: "outreachMemberId" };
    }
  }

  if (input.outreachCampaignId && expectedCanonical) {
    const expectedContact = await db.query.contacts.findFirst({
      where: eq(contacts.linkedinUrlCanonical, expectedCanonical),
    });
    if (
      expectedContact &&
      (await campaignMemberByContactId(
        db,
        input.outreachCampaignId,
        expectedContact.id,
      ))
    ) {
      return { contact: expectedContact, resolvedVia: "expectedProfileUrl" };
    }
  }

  if (input.outreachCampaignId && scrapedCanonical) {
    const scrapedContact = await db.query.contacts.findFirst({
      where: eq(contacts.linkedinUrlCanonical, scrapedCanonical),
    });
    if (
      scrapedContact &&
      (await campaignMemberByContactId(
        db,
        input.outreachCampaignId,
        scrapedContact.id,
      ))
    ) {
      return { contact: scrapedContact, resolvedVia: "scrapedUrlOnCampaign" };
    }

    const scrapedVanity = profileVanity(scrapedCanonical);
    const members = await listCampaignMemberContacts(db, input.outreachCampaignId);
    if (scrapedVanity) {
      for (const m of members) {
        if (profileVanity(m.linkedinUrlCanonical) === scrapedVanity) {
          return { contact: m, resolvedVia: "vanityMatch" };
        }
      }
    }

    if (nameNorm) {
      const byName = members.filter(
        (m) => normalizeParticipantName(m.fullName) === nameNorm,
      );
      if (byName.length === 1) {
        return { contact: byName[0], resolvedVia: "nameMatch" };
      }
    }

    if (expectedCanonical) {
      const expectedVanity = profileVanity(expectedCanonical);
      if (expectedVanity) {
        for (const m of members) {
          if (profileVanity(m.linkedinUrlCanonical) === expectedVanity) {
            return { contact: m, resolvedVia: "expectedVanityMatch" };
          }
        }
      }
    }
  }

  if (scrapedCanonical) {
    const scrapedContact = await db.query.contacts.findFirst({
      where: eq(contacts.linkedinUrlCanonical, scrapedCanonical),
    });
    if (scrapedContact) {
      return { contact: scrapedContact, resolvedVia: "scrapedUrl" };
    }
  }

  return { contact: undefined, resolvedVia: null };
}
