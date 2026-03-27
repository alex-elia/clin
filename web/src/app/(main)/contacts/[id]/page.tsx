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
          className="text-sm text-zinc-600 underline dark:text-zinc-400"
        >
          ← Contacts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {contact.fullName ?? "Unknown"}
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {contact.headline ?? "—"}
        </p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {contact.company ?? "—"} · {contact.location ?? "—"}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          <span className="rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-900">
            {contact.segment}
          </span>{" "}
          <span className="ml-2 font-mono">
            R{contact.relationshipScore} B{contact.businessScore} C
            {contact.cleanupScore}
          </span>
        </p>
        {contact.linkedinUrlCanonical ? (
          <p className="mt-2 text-sm">
            <a
              href={contact.linkedinUrlCanonical}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline dark:text-blue-400"
            >
              Open LinkedIn profile
            </a>
          </p>
        ) : null}
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
