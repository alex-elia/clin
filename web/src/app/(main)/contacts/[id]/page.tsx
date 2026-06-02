import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactActionBar } from "@/components/ContactActionBar";
import { ContactLlmPanel } from "@/components/ContactLlmPanel";
import { ContactProfileCaptureSummary } from "@/components/ContactProfileCaptureSummary";
import { selectContactLlmExtension } from "@/lib/contactSqlExtras";
import { contactPickerLabel } from "@/lib/contactDisplay";
import { getContactById } from "@/lib/queries";
import {
  listCampaignMembershipsForContact,
  listOutreachCampaigns,
} from "@/lib/outreachCampaigns";
import {
  getLatestMessagingCaptureForContact,
  resolveMessageContextForAnalysis,
} from "@/lib/messagingContext";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await getContactById(id);
  if (!contact) notFound();

  const [llm, messagingCapture, campaigns, memberships] = await Promise.all([
    Promise.resolve(selectContactLlmExtension(contact.id)),
    getLatestMessagingCaptureForContact(contact.id),
    listOutreachCampaigns(),
    listCampaignMembershipsForContact(contact.id),
  ]);

  const initialMessage = resolveMessageContextForAnalysis(
    llm?.llmMessageContext,
    messagingCapture?.text,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link href="/contacts" className="clin-link text-sm">
          ← Contacts
        </Link>
        <h1 className="mt-2 clin-page-title">
          {contactPickerLabel(contact).split(" · ")[0]}
        </h1>
        <p className="mt-1 text-sm text-clin-muted">
          {contact.headline ?? "—"}
        </p>
        <p className="mt-1 text-sm text-clin-muted">
          {contact.company ?? "—"}
          {contact.location ? ` · ${contact.location}` : ""}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-clin-muted">
          <span className="clin-pill">{contact.segment}</span>
          <span className="font-mono" title="Recency · Business keywords · Cleanup">
            R{contact.relationshipScore} B{contact.businessScore} C
            {contact.cleanupScore}
          </span>
        </p>
      </div>

      <ContactActionBar
        contactId={contact.id}
        linkedinUrl={contact.linkedinUrlCanonical}
        campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
        memberships={memberships}
      />

      <ContactProfileCaptureSummary
        contactId={contact.id}
        headline={contact.headline}
        company={contact.company}
        location={contact.location}
      />

      <ContactLlmPanel
        contactId={contact.id}
        ruleScores={{
          r: contact.relationshipScore,
          b: contact.businessScore,
          c: contact.cleanupScore,
        }}
        initialMessage={initialMessage ?? ""}
        messagingCaptureMeta={
          messagingCapture
            ? {
                messageCount: messagingCapture.messageCount,
                capturedAt: messagingCapture.capturedAt.toISOString(),
                needsReply: messagingCapture.replyState.needsReply,
              }
            : null
        }
        initialProvisional={llm?.llmProvisionalJson ?? null}
        initialRefined={llm?.llmRefinedJson ?? null}
      />
    </div>
  );
}
