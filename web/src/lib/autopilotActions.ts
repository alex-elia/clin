import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import {
  pickLatestAnalysisView,
  type OutreachFitView,
} from "@/lib/contactLlmDisplay";
import { selectContactLlmExtension } from "@/lib/contactSqlExtras";
import { generateOutreachDraftForMember } from "@/lib/outreachCampaignDraft";
import {
  addContactsToCampaign,
  findMemberByCampaignAndContact,
} from "@/lib/outreachCampaigns";

const ALLOWED_SEGMENTS = new Set([
  "warm",
  "dormant",
  "ghost",
  "remove_candidate",
]);

export type AutopilotActionPolicy = {
  draftOnReachOut: boolean;
  tagSkipAsGhost: boolean;
  tagNurtureAsWarm: boolean;
};

export type ContactAutopilotActionResult = {
  contactId: string;
  fit: OutreachFitView["recommendation"] | "none";
  actions: string[];
  errors: string[];
};

function parseEnvelopeJson(raw: string | null): unknown {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function getOutreachFitForContact(
  contactId: string,
): OutreachFitView | null {
  const ext = selectContactLlmExtension(contactId);
  const view = pickLatestAnalysisView(
    parseEnvelopeJson(ext?.llmRefinedJson ?? null),
    parseEnvelopeJson(ext?.llmProvisionalJson ?? null),
  );
  return view?.outreachFit ?? null;
}

export async function setContactSegment(
  contactId: string,
  segment: string,
): Promise<void> {
  if (!ALLOWED_SEGMENTS.has(segment)) {
    throw new Error(`Invalid segment: ${segment}`);
  }
  const db = getDb();
  await db
    .update(contacts)
    .set({ segment, lastUpdatedAt: new Date() })
    .where(eq(contacts.id, contactId));
}

export async function applyAutopilotActionsForContact(opts: {
  contactId: string;
  campaignId: string;
  policy: AutopilotActionPolicy;
}): Promise<ContactAutopilotActionResult> {
  const { contactId, campaignId, policy } = opts;
  const actions: string[] = [];
  const errors: string[] = [];

  const fit = getOutreachFitForContact(contactId);
  const rec = fit?.recommendation ?? "none";

  if (rec === "reach_out" && policy.draftOnReachOut) {
    await addContactsToCampaign(campaignId, [contactId]);
    let member = await findMemberByCampaignAndContact(campaignId, contactId);
    if (!member) {
      errors.push("Could not add to campaign.");
    } else {
      const gen = await generateOutreachDraftForMember(member.id);
      if (gen.ok) {
        actions.push("draft_generated");
      } else {
        errors.push(gen.error);
      }
    }
  }

  if (rec === "skip" && policy.tagSkipAsGhost) {
    await setContactSegment(contactId, "ghost");
    actions.push("tagged_ghost");
  }

  if (rec === "nurture" && policy.tagNurtureAsWarm) {
    await setContactSegment(contactId, "warm");
    actions.push("tagged_warm");
  }

  if (rec === "reach_out" && !policy.draftOnReachOut) {
    await addContactsToCampaign(campaignId, [contactId]);
    actions.push("added_to_campaign");
  }

  return { contactId, fit: rec, actions, errors };
}
