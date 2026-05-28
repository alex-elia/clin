import Link from "next/link";
import {
  generateUserGoalsAndPositioningAction,
  saveGlobalWriterForm,
  saveUserContextContactOnly,
  saveUserContextForm,
} from "@/app/actions";
import { getGlobalWriterInstructions } from "@/lib/brand";
import { ClaimProfileUrlForm } from "@/components/ClaimProfileUrlForm";
import { contactPickerLabel } from "@/lib/contactDisplay";
import { getSelfProfileReadyForOllama } from "@/lib/userProfileLlm";
import { getOrCreateUserContext } from "@/lib/userContext";
import { getContactById, listContacts } from "@/lib/queries";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const ctx = await getOrCreateUserContext();
  const globalWriter = await getGlobalWriterInstructions();
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
        <h1 className="clin-page-title">
          You &amp; goals
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-clin-muted">
          Order: link your contact → open your LinkedIn profile and run{" "}
          <strong className="clin-strong">
            Capture
          </strong>{" "}
          in the extension → then Ollama can generate goals and positioning from
          those fields (you can edit afterward). Contact-level{" "}
          <strong className="clin-strong">
            Ollama analysis
          </strong>{" "}
          includes this as{" "}
          <code className="clin-code">
            owner_context
          </code>{" "}
          so scores and suggestions align with your intent.
        </p>
      </div>

      <section className="clin-card p-5">
        <h2 className="clin-section-title">
          From profile URL
        </h2>
        <p className="mt-1 text-sm text-clin-muted">
          Paste your public profile link. Clin records it and creates (or links)
          a contact. LinkedIn does not allow server-side scraping —{" "}
          <strong className="clin-strong">
            visible fields
          </strong>{" "}
          are filled when you open that profile while logged in and run{" "}
          <strong className="clin-strong">
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
        className="clin-card space-y-4 p-5"
      >
        <h2 className="clin-section-title">
          Your profile contact
        </h2>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-clin-text">
            Who is you in this database
          </span>
          <select
            name="selfContactId"
            defaultValue={ctx.selfContactId ?? ""}
            className="mt-1 clin-input"
          >
            <option value="">— Not linked —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {contactPickerLabel(c)}
              </option>
            ))}
          </select>
          <span className="block text-xs text-clin-muted">
            Saving queues the Clin extension to open this profile and capture
            visible fields (keep Chrome logged into LinkedIn). Open the
            extension popup once to run immediately, or wait up to ~1 minute.
          </span>
        </label>

        {ctx.selfContactId ? (
          <p className="text-xs text-clin-muted">
            <Link
              href={`/contacts/${ctx.selfContactId}`}
              className="clin-link"
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
          className="clin-btn-primary"
        >
          Save profile link &amp; queue capture
        </button>
      </form>

      <section className="clin-card p-5">
        <h2 className="clin-section-title">
          Generate goals &amp; positioning (Ollama)
        </h2>
        <p className="mt-1 text-sm text-clin-muted">
          Requires at least one extension{" "}
          <strong className="clin-strong">
            profile
          </strong>{" "}
          capture (on your /in/… page) with name, headline, company, or
          location saved. Writes both Goals and Positioning summary. Existing
          goals are used as hints. Configure Ollama in{" "}
          <Link
            href="/settings"
            className="clin-link"
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
            className="clin-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Generate with Ollama
          </button>
        </form>
      </section>

      <form
        action={saveUserContextForm}
        className="clin-card space-y-5 p-5"
      >
        <h2 className="clin-section-title">
          Edit goals &amp; positioning
        </h2>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-clin-text">
            Goals &amp; constraints
          </span>
          <textarea
            name="goalsText"
            rows={6}
            defaultValue={ctx.goalsText ?? ""}
            placeholder="Filled by Ollama above, or type your own."
            className="mt-1 clin-input"
          />
          <span className="block text-xs text-clin-muted">
            Fed into contact analysis as owner_context. Regenerate anytime with
            Ollama.
          </span>
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium text-clin-text">
            Positioning summary
          </span>
          <textarea
            name="positioningSummary"
            rows={8}
            defaultValue={ctx.positioningSummary ?? ""}
            placeholder="Filled by Ollama above, or write by hand."
            className="mt-1 clin-input font-mono text-xs"
          />
        </label>

        <button
          type="submit"
          className="clin-btn-primary"
        >
          Save edits
        </button>
      </form>

      <form
        action={saveGlobalWriterForm}
        className="clin-card space-y-3 p-5"
      >
        <h2 className="text-lg font-medium text-[var(--clin-text)]">
          Voice for all campaign drafts
        </h2>
        <p className="text-sm text-[var(--clin-muted)]">
          Merged into every outreach draft (tone, must-mention, avoid). Your goals
          and positioning above are separate.
        </p>
        <textarea
          name="globalWriterInstructions"
          rows={5}
          defaultValue={globalWriter ?? ""}
          placeholder="e.g. Warm founder tone, mention Elia Studio, no hard sell…"
          className="w-full rounded-md border border-[var(--clin-border)] px-3 py-2 text-sm"
        />
        <button type="submit" className="clin-btn-primary">
          Save global voice
        </button>
      </form>

      <p className="text-xs text-[var(--clin-muted)]">
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
