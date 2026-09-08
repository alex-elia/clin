import Link from "next/link";
import { Suspense } from "react";
import { AutopilotBatchPanel } from "@/app/(main)/(data)/autopilot/AutopilotBatchPanel";
import { CleaningExecQueuePanel } from "@/components/CleaningExecQueuePanel";
import { CleaningBoard } from "@/components/CleaningBoard";
import { CleaningExecPanels } from "@/components/CleaningExecPanels";
import { CleaningWorkflowStrip } from "@/components/CleaningWorkflowStrip";
import { NetworkHygienePipelinePanel } from "@/components/NetworkHygienePipelinePanel";
import { getDb } from "@/db";
import {
  countContactsPendingLlmAnalysis,
  getAutopilotSettings,
} from "@/lib/autopilot";
import {
  buildCleaningBoard,
  collectEngageContactIds,
} from "@/lib/cleaningBoard";
import { listPendingCleaningExecItems } from "@/lib/cleaningExecQueueList";
import { countRemovalSignals } from "@/lib/cleaningRemovalSignals";
import { getNetworkHygieneSnapshot } from "@/lib/networkHygienePipeline";

export const dynamic = "force-dynamic";

export default async function CleaningPage({
  searchParams,
}: {
  searchParams: Promise<{
    bucket?: string;
    filter?: string;
    removal?: string;
    verdict?: string;
  }>;
}) {
  getDb();
  const sp = await searchParams;
  const [board, settings, pending, execItems, hygiene] = await Promise.all([
    buildCleaningBoard({
      lowActivityOnly: sp.filter === "low_activity",
    }),
    getAutopilotSettings(),
    Promise.resolve(countContactsPendingLlmAnalysis()),
    listPendingCleaningExecItems({ limit: 100 }),
    getNetworkHygieneSnapshot(),
  ]);
  const engageQueue = execItems.filter((i) => i.kind === "engage");
  const removalQueue = execItems.filter((i) => i.kind === "removal");
  const removalSignals = countRemovalSignals(hygiene.rows);

  return (
    <div className="space-y-10">
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
          <Link href="/data" className="clin-link">
            Data & cleaning
          </Link>
        </p>
        <h1 className="clin-page-title">Cleaning</h1>
        <p className="clin-page-lead">
          Analyze contacts, work through buckets, then run paced disconnects and
          engage tasks from the extension Cleaning tab.
        </p>
      </div>

      <CleaningWorkflowStrip
        pendingAnalysis={pending}
        reviewRemoveBucket={board.summary.bucketCounts.review_remove ?? 0}
        removalSignals={removalSignals.unstagedSignals}
        removalQueued={board.execCounts.removalPending}
        engageQueued={board.execCounts.engagePending}
      />

      <Suspense fallback={<p className="text-sm text-[var(--clin-muted)]">Loading buckets…</p>}>
        <CleaningBoard data={board} hygieneRows={hygiene.rows} />
      </Suspense>

      <div id="exec-queues" className="space-y-10 scroll-mt-8">
        <CleaningExecQueuePanel
          initialEngage={engageQueue}
          initialRemoval={removalQueue}
        />

        <CleaningExecPanels
          engageBucketCount={board.summary.bucketCounts.engage_comment ?? 0}
          removalBucketCount={board.summary.bucketCounts.review_remove ?? 0}
          engageExecPending={board.execCounts.engagePending}
          removalExecPending={board.execCounts.removalPending}
          engageContactIds={collectEngageContactIds(board.byBucket)}
        />
      </div>

      <div id="batch-analysis" className="scroll-mt-8">
        <AutopilotBatchPanel
          defaultLimit={settings.batchDefaultLimit}
          pendingCount={pending}
        />
      </div>

      <details className="clin-card group">
        <summary className="cursor-pointer list-none p-5 font-medium [&::-webkit-details-marker]:hidden">
          <span className="clin-section-title">Network metrics (optional)</span>
          <p className="mt-1 text-sm font-normal text-[var(--clin-muted)]">
            Coverage charts and hygiene scan. Day-to-day cleaning uses the buckets
            above.
          </p>
        </summary>
        <div className="border-t border-[var(--clin-border)] px-5 pb-5 pt-4">
          <NetworkHygienePipelinePanel />
        </div>
      </details>

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
