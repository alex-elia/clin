import Link from "next/link";
import { saveGlobalWriterForm } from "@/app/actions";
import { getGlobalWriterInstructions } from "@/lib/brand";
import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";
import { getOrCreateUserContext } from "@/lib/userContext";
import { getVoiceSetupStatus } from "@/lib/voiceSetup";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const [ctx, brand, setup, globalWriter] = await Promise.all([
    getOrCreateUserContext(),
    getOrCreateContentBrandContext(),
    getVoiceSetupStatus(),
    getGlobalWriterInstructions(),
  ]);

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="clin-page-title">You &amp; voice</h1>
        <p className="clin-page-lead">
          Summary of what powers the writing assistant and outreach. For LinkedIn
          posts, complete the setup tutorial first.
        </p>
      </div>

      {!setup.complete ? (
        <section className="clin-card border-2 border-[var(--clin-accent)]/30 p-5">
          <h2 className="clin-section-title">Setup required</h2>
          <p className="mt-2 text-sm text-[var(--clin-muted)]">
            Before writing posts, run the short voice tutorial (profile, goals,
            rhythm).
          </p>
          <Link href="/branding/setup" className="clin-btn-primary mt-4 inline-block">
            Start voice setup
          </Link>
        </section>
      ) : (
        <section className="clin-card p-5 text-sm">
          <p className="text-emerald-800 dark:text-emerald-200">Voice setup complete.</p>
          <Link href="/branding/setup" className="clin-link mt-2 inline-block text-sm">
            Re-run setup tutorial
          </Link>
        </section>
      )}

      <section className="clin-card space-y-3 p-5 text-sm">
        <h2 className="clin-section-title">Content voice (posts)</h2>
        <dl className="space-y-2 text-[var(--clin-muted)]">
          <div>
            <dt className="font-medium text-[var(--clin-text)]">Goals</dt>
            <dd className="mt-0.5 whitespace-pre-wrap">
              {ctx.goalsText?.trim() || "—"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--clin-text)]">Positioning</dt>
            <dd className="mt-0.5 whitespace-pre-wrap">
              {ctx.positioningSummary?.trim() || "—"}
            </dd>
          </div>
          {brand.contentDoctrine ? (
            <div>
              <dt className="font-medium text-[var(--clin-text)]">Content principles</dt>
              <dd className="mt-0.5 whitespace-pre-wrap">{brand.contentDoctrine}</dd>
            </div>
          ) : null}
        </dl>
        <Link href="/branding/setup" className="clin-link">
          Edit in setup
        </Link>
      </section>

      <form action={saveGlobalWriterForm} className="clin-card space-y-3 p-5">
        <h2 className="clin-section-title">Outreach writer (DMs)</h2>
        <p className="text-xs text-[var(--clin-muted)]">
          Used for campaign outreach drafts, not LinkedIn posts.
        </p>
        <textarea
          name="globalWriterInstructions"
          rows={4}
          defaultValue={globalWriter ?? ""}
          className="clin-input text-sm"
        />
        <button type="submit" className="clin-btn-secondary">
          Save outreach voice
        </button>
      </form>

      <p className="text-xs text-[var(--clin-muted)]">
        Profile capture &amp; AI goals generation:{" "}
        <Link href="/branding/setup" className="clin-link">
          voice setup
        </Link>
        . Inference:{" "}
        <Link href="/settings" className="clin-link">
          Settings
        </Link>
        .
      </p>
    </div>
  );
}
