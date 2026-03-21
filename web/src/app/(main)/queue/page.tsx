import Link from "next/link";
import { listQueuePending } from "@/lib/queries";
import { QueueActions } from "./QueueActions";

export const dynamic = "force-dynamic";

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ shuffle?: string }>;
}) {
  const sp = await searchParams;
  const shuffle = sp.shuffle === "1";
  const items = await listQueuePending(shuffle);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review queue</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Human-approved workflow only. Open LinkedIn yourself; Clin does not
          automate the site.
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
          Shuffle order (local randomness)
        </Link>
      </div>

      {shuffle ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Shuffled order uses Fisher–Yates inside Clin only. It does not change
          LinkedIn behavior or help you &quot;avoid detection&quot; — that is
          intentionally out of scope.
        </p>
      ) : null}

      <QueueActions items={items} />
    </div>
  );
}
