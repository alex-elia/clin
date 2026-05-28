import Link from "next/link";
import { listQueuePending } from "@/lib/queries";
import { getPaceSettings } from "@/lib/pace";
import { QueueActions } from "./QueueActions";

export const dynamic = "force-dynamic";

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ shuffle?: string; order?: string }>;
}) {
  const sp = await searchParams;
  const shuffle = sp.shuffle === "1";
  const sort =
    !shuffle && sp.order === "cleanup" ? ("cleanup" as const) : ("priority" as const);
  const [items, pace] = await Promise.all([
    listQueuePending(shuffle, sort),
    getPaceSettings(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="clin-page-title">Review queue</h1>
        <p className="mt-1 text-sm text-clin-muted">
          Human actions only, in{" "}
          <Link href="/settings" className="clin-link">
            small slow batches
          </Link>
          . Sort by{" "}
          <strong className="clin-strong">
            cleanup score
          </strong>{" "}
          to tackle removals and stale connections first. Clin does not click or
          type on LinkedIn for you.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href="/queue"
          className={`rounded-md px-3 py-1.5 ${!shuffle && sort === "priority" ? "clin-btn-primary" : "clin-btn-secondary"}`}
        >
          Queue priority
        </Link>
        <Link
          href="/queue?order=cleanup"
          className={`rounded-md px-3 py-1.5 ${!shuffle && sort === "cleanup" ? "clin-btn-primary" : "clin-btn-secondary"}`}
        >
          Cleanup first
        </Link>
        <Link
          href="/queue?shuffle=1"
          className={`rounded-md px-3 py-1.5 ${shuffle ? "clin-btn-primary" : "clin-btn-secondary"}`}
        >
          Shuffle (local only)
        </Link>
      </div>

      {shuffle ? (
        <p className="clin-callout text-xs">
          Shuffle only changes list order inside Clin. It is unrelated to LinkedIn
          risk.
        </p>
      ) : sort === "cleanup" ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Cleanup first: highest <span className="font-mono">cleanupScore</span>{" "}
          at the top (then queue priority, then age). Recompute scores in Overview
          after big imports.
        </p>
      ) : null}

      <QueueActions
        items={items}
        batchSize={pace.queueBatchSize}
        minSecondsBetweenProfileOpens={pace.minSecondsBetweenProfileOpens}
        paceJitterPercent={pace.paceJitterPercent}
        sortMode={sort}
      />
    </div>
  );
}
