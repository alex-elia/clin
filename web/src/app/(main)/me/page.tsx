import Link from "next/link";
import {
  generateUserGoalsAndPositioningAction,
  saveUserContextContactOnly,
  saveUserContextForm,
} from "@/app/actions";
import { ClaimProfileUrlForm } from "@/components/ClaimProfileUrlForm";
import { contactPickerLabel } from "@/lib/contactDisplay";
import { getSelfProfileReadyForOllama } from "@/lib/userProfileLlm";
import { getOrCreateUserContext } from "@/lib/userContext";
import { getContactById, listContacts } from "@/lib/queries";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const ctx = await getOrCreateUserContext();
  const db = getDb();

  const ollamaReady = ctx.selfContactId
    ? await getSelfProfileReadyForOllama(db, ctx.selfContactId)
    : ({
        ok: false as const,
        message:
          "Choose your profile contact below and click Save profile link first.",
      } as const);

  let contacts = await listContacts({ limit: 100 });
  if (ctx.selfContactId) {
    const selfRow = await getContactById(ctx.selfContactId);
    if (selfRow) {
      const rest = contacts.filter((c) => c.id !== selfRow.id);
      contacts = [selfRow, ...rest];
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          You &amp; goals
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Order: link your contact → open your LinkedIn profile and run{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">
            Capture
          </strong>{" "}
          in the extension → then Ollama can generate goals and positioning from
          those fields (you can edit afterward). Contact-level{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">
            Ollama analysis
          </strong>{" "}
          includes this as{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-900">
            owner_context
          </code>{" "}
          so scores and suggestions align with your intent.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          From profile URL
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Paste your public profile link. Clin records it and creates (or links)
          a contact. LinkedIn does not allow server-side scraping —{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">
            visible fields
          </strong>{" "}
          are filled when you open that profile while logged in and run{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">
            Capture
          </strong>{" "}
          in the extension.
        </p>
        <div className="mt-4">
          <ClaimProfileUrlForm />
        </div>
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-medium">Or capture without pasting a URL</p>
        <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
          Open your profile on LinkedIn (
          <code className="text-xs">/in/your-name</code>), use the Clin extension
          Capture, then pick that contact in the form below.
        </p>
      </section>

      <form
        action={saveUserContextContactOnly}
        className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Your profile contact
        </h2>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            Who is you in this database
          </span>
          <select
            name="selfContactId"
            defaultValue={ctx.selfContactId ?? ""}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">— Not linked —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {contactPickerLabel(c)}
              </option>
            ))}
          </select>
          <span className="block text-xs text-zinc-500">
            Saving queues the Clin extension to open this profile and capture
            visible fields (keep Chrome logged into LinkedIn). Open the
            extension popup once to run immediately, or wait up to ~1 minute.
          </span>
        </label>

        {ctx.selfContactId ? (
          <p className="text-xs text-zinc-500">
            <Link
              href={`/contacts/${ctx.selfContactId}`}
              className="text-blue-600 underline dark:text-blue-400"
            >
              Open your contact record
            </Link>
          </p>
        ) : null}

        {ctx.pendingSelfCaptureUrl ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            Capture queued for the extension. If nothing happens, open the Clin
            popup (same API base as this app) while Clin is running.
          </p>
        ) : null}

        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save profile link &amp; queue capture
        </button>
      </form>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Generate goals &amp; positioning (Ollama)
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Requires at least one extension{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">
            profile
          </strong>{" "}
          capture (on your /in/… page) with name, headline, company, or
          location saved. Writes both Goals and Positioning summary. Existing
          goals are used as hints. Configure Ollama in{" "}
          <Link
            href="/settings"
            className="text-blue-600 underline dark:text-blue-400"
          >
            Settings
          </Link>
          .
        </p>
        {!ollamaReady.ok ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            {ollamaReady.message}
          </p>
        ) : null}
        <form action={generateUserGoalsAndPositioningAction} className="mt-4">
          <button
            type="submit"
            disabled={!ollamaReady.ok}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 enabled:hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:enabled:hover:bg-zinc-800"
          >
            Generate with Ollama
          </button>
        </form>
      </section>

      <form
        action={saveUserContextForm}
        className="space-y-5 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Edit goals &amp; positioning
        </h2>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            Goals &amp; constraints
          </span>
          <textarea
            name="goalsText"
            rows={6}
            defaultValue={ctx.goalsText ?? ""}
            placeholder="Filled by Ollama above, or type your own."
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
          />
          <span className="block text-xs text-zinc-500">
            Fed into contact analysis as owner_context. Regenerate anytime with
            Ollama.
          </span>
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            Positioning summary
          </span>
          <textarea
            name="positioningSummary"
            rows={8}
            defaultValue={ctx.positioningSummary ?? ""}
            placeholder="Filled by Ollama above, or write by hand."
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
          />
        </label>

        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save edits
        </button>
      </form>

      <p className="text-xs text-zinc-500">
        Last updated:{" "}
        {ctx.updatedAt
          ? new Date(ctx.updatedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : "—"}
      </p>
    </div>
  );
}
