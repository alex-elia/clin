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
        <h1 className="text-2xl font-semibold tracking-tight">Review queue</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Human actions only, in{" "}
          <Link href="/settings" className="underline">
            small slow batches
          </Link>
          . Sort by{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">
            cleanup score
          </strong>{" "}
          to tackle removals and stale connections first. Clin does not click or
          type on LinkedIn for you.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href="/queue"
          className={`rounded-md px-3 py-1.5 ${!shuffle && sort === "priority" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 dark:border-zinc-600"}`}
        >
          Queue priority
        </Link>
        <Link
          href="/queue?order=cleanup"
          className={`rounded-md px-3 py-1.5 ${!shuffle && sort === "cleanup" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 dark:border-zinc-600"}`}
        >
          Cleanup first
        </Link>
        <Link
          href="/queue?shuffle=1"
          className={`rounded-md px-3 py-1.5 ${shuffle ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 dark:border-zinc-600"}`}
        >
          Shuffle (local only)
        </Link>
      </div>

      {shuffle ? (
        <p className="rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
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
