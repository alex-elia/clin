import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactLlmPanel } from "@/components/ContactLlmPanel";
import { selectContactLlmExtension } from "@/lib/contactSqlExtras";
import { getContactById } from "@/lib/queries";
import { getOllamaSettings } from "@/lib/ollamaSettings";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await getContactById(id);
  if (!contact) notFound();

  const llm = selectContactLlmExtension(contact.id);

  const ollama = await getOllamaSettings();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link
          href="/contacts"
          className="clin-link text-sm"
        >
          ← Contacts
        </Link>
        <h1 className="mt-2 clin-page-title">
          {contact.fullName ?? "Unknown"}
        </h1>
        <p className="mt-1 text-sm text-clin-muted">
          {contact.headline ?? "—"}
        </p>
        <p className="mt-1 text-sm text-clin-muted">
          {contact.company ?? "—"} · {contact.location ?? "—"}
        </p>
        <p className="mt-2 text-xs text-clin-muted">
          <span className="clin-pill">
            {contact.segment}
          </span>{" "}
          <span className="ml-2 font-mono">
            R{contact.relationshipScore} B{contact.businessScore} C
            {contact.cleanupScore}
          </span>
        </p>
        <p className="mt-2 flex flex-wrap gap-3 text-sm">
          {contact.linkedinUrlCanonical ? (
            <a
              href={contact.linkedinUrlCanonical}
              target="_blank"
              rel="noreferrer"
              className="clin-link"
            >
              Open LinkedIn profile
            </a>
          ) : null}
          <Link
            href={`/inbox?contact=${encodeURIComponent(contact.id)}`}
            className="clin-link"
          >
            Inbox threads
          </Link>
        </p>
      </div>

      <ContactLlmPanel
        contactId={contact.id}
        ruleScores={{
          r: contact.relationshipScore,
          b: contact.businessScore,
          c: contact.cleanupScore,
        }}
        initialMessage={llm?.llmMessageContext ?? ""}
        initialProvisional={llm?.llmProvisionalJson ?? null}
        initialRefined={llm?.llmRefinedJson ?? null}
        ollamaBase={ollama.baseUrl}
        ollamaModel={ollama.model}
      />
    </div>
  );
}
