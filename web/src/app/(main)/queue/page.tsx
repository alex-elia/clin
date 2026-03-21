import Link from "next/link";
import { listQueuePending } from "@/lib/queries";
import { getPaceSettings } from "@/lib/pace";
import { QueueActions } from "./QueueActions";

export const dynamic = "force-dynamic";

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ shuffle?: string }>;
}) {
  const sp = await searchParams;
  const shuffle = sp.shuffle === "1";
  const [items, pace] = await Promise.all([
    listQueuePending(shuffle),
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
          . Clin does not click or type on LinkedIn for you.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href="/queue"
          className={`rounded-md px-3 py-1.5 ${!shuffle ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 dark:border-zinc-600"}`}
        >
          Priority order
        </Link>
        <Link
          href="/queue?shuffle=1"
          className={`rounded-md px-3 py-1.5 ${shuffle ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 dark:border-zinc-600"}`}
        >
          Shuffle order (local only)
        </Link>
      </div>

      {shuffle ? (
        <p className="rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          Shuffle only changes list order inside Clin. It is unrelated to LinkedIn
          risk.
        </p>
      ) : null}

      <QueueActions
        items={items}
        batchSize={pace.queueBatchSize}
        minSecondsBetweenProfileOpens={pace.minSecondsBetweenProfileOpens}
      />
    </div>
  );
}
