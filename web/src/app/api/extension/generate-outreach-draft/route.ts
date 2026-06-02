import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import { generateOutreachDraftForMember } from "@/lib/outreachCampaignDraft";
import { getLlmConfig } from "@/lib/llm/completeChat";
import {
  findMemberByCampaignAndContact,
  getActiveOutreachCampaignId,
  getCaptureTargetCampaignId,
  getOutreachCampaign,
  findMemberById,
} from "@/lib/outreachCampaigns";
import { canonicalizeLinkedInUrl } from "@/lib/url";
import { trackTimedFeature } from "@/lib/telemetry/orchestration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  profileUrl: z.string().min(1),
});

/**
 * Run local Ollama for the open LinkedIn profile if that contact is in the capture-target
 * (or active extension) campaign. Extension copies the result; Clin does not send DMs.
 */
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Expected { profileUrl } (tab URL is fine)." },
      { status: 400 },
    );
  }

  const canonical = canonicalizeLinkedInUrl(parsed.data.profileUrl);
  if (!canonical) {
    return NextResponse.json(
      { error: "Could not derive a LinkedIn profile URL." },
      { status: 400 },
    );
  }

  const db = getDb();
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.linkedinUrlCanonical, canonical),
  });
  if (!contact) {
    return NextResponse.json(
      {
        error:
          "Contact not in Clin yet. Capture this profile with the extension first (ideally with a capture target set).",
      },
      { status: 404 },
    );
  }

  let campaignId = await getCaptureTargetCampaignId();
  if (!campaignId) campaignId = await getActiveOutreachCampaignId();
  if (!campaignId) {
    return NextResponse.json(
      {
        error:
          "No campaign selected. In Clin → Campaigns, set “Capture LinkedIn into this campaign” or “Set active for extension”.",
      },
      { status: 400 },
    );
  }

  const campaign = await getOutreachCampaign(campaignId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const member = await findMemberByCampaignAndContact(campaignId, contact.id);
  if (!member) {
    return NextResponse.json(
      {
        error: `“${contact.fullName ?? contact.id}” is not in campaign “${campaign.name}”. Capture them while this campaign is the capture target, or add them on the campaign page.`,
      },
      { status: 404 },
    );
  }

  const llm = await getLlmConfig();
  if (process.env.NODE_ENV !== "production") {
    console.info("[clin:outreach-draft] POST generate-outreach-draft", {
      contactId: contact.id,
      memberId: member.id,
      campaignId,
      provider: llm.provider,
      model: llm.model,
      baseUrl: llm.baseUrl,
    });
  }

  const gen = await trackTimedFeature(
    "extension_outreach_draft",
    () => generateOutreachDraftForMember(member.id),
    { contactId: contact.id, campaignId, memberId: member.id },
  );
  if (!gen.ok) {
    return NextResponse.json(
      {
        error: gen.error,
        stage: gen.stage,
        llm: { provider: llm.provider, baseUrl: llm.baseUrl, model: llm.model },
        ollama: { baseUrl: llm.baseUrl, model: llm.model },
      },
      { status: 502 },
    );
  }

  const row = await findMemberById(member.id);
  const draft = row?.draftOutreach?.trim() ?? "";

  return NextResponse.json({
    draft,
    memberId: member.id,
    contactId: contact.id,
    campaignId,
    campaignName: campaign.name,
    fullName: contact.fullName,
  });
}
