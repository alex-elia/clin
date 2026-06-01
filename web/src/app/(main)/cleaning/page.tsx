import Link from "next/link";
import { Suspense } from "react";
import { AutopilotBatchPanel } from "@/app/(main)/autopilot/AutopilotBatchPanel";
import { CleaningBoard } from "@/components/CleaningBoard";
import { getDb } from "@/db";
import {
  countContactsPendingLlmAnalysis,
  getAutopilotSettings,
} from "@/lib/autopilot";
import { buildCleaningBoard } from "@/lib/cleaningBoard";

export const dynamic = "force-dynamic";

export default async function CleaningPage() {
  getDb();
  const [board, settings, pending] = await Promise.all([
    buildCleaningBoard(),
    getAutopilotSettings(),
    Promise.resolve(countContactsPendingLlmAnalysis()),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
          <Link href="/data" className="clin-link">
            Data & cleaning
          </Link>
        </p>
        <h1 className="clin-page-title">Cleaning</h1>
        <p className="clin-page-lead">
          After you import and enrich contacts on LinkedIn, Clin scores who is
          worth keeping, nurturing, engaging lightly, or reaching out to — then
          buckets them so you can review in batches instead of one-by-one.
        </p>
      </div>

      <section className="clin-callout">
        <h2 className="clin-section-title">Workflow</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-[var(--clin-muted)]">
          <li>
            Extension <strong className="clin-strong">Import &amp; enrich</strong>{" "}
            on search or lists (full profile + optional messaging).
          </li>
          <li>
            Clin checks <strong className="clin-strong">extraction readiness</strong>{" "}
            (list-only vs rich profile).
          </li>
          <li>
            Run <strong className="clin-strong">batch analysis</strong> below (or
            enable auto-analysis in Settings after capture).
          </li>
          <li>
            Work through <strong className="clin-strong">buckets</strong> — remove,
            comment, nurture, or DM — and use{" "}
            <Link href="/queue" className="clin-link">
              Review queue
            </Link>{" "}
            /{" "}
            <Link href="/decisions" className="clin-link">
              Decisions
            </Link>{" "}
            for outreach prep.
          </li>
        </ol>
      </section>

      <Suspense fallback={<p className="text-sm text-[var(--clin-muted)]">Loading buckets…</p>}>
        <CleaningBoard data={board} />
      </Suspense>

      <AutopilotBatchPanel
        defaultLimit={settings.batchDefaultLimit}
        pendingCount={pending}
      />

      <p className="text-sm text-[var(--clin-muted)]">
        Campaign-specific autopilot (drafts + tags) lives on{" "}
        <Link href="/autopilot" className="clin-link">
          Autopilot
        </Link>
        .
      </p>
    </div>
  );
}
