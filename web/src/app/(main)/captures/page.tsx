import { listCaptures } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CapturesPage() {
  const rows = await listCaptures(50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Capture log</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Recent ingest events from the extension or API.
        </p>
      </div>

      <ul className="space-y-3">
        {rows.length === 0 ? (
          <li className="text-sm text-zinc-500">No captures yet.</li>
        ) : (
          rows.map((r) => (
            <li
              key={r.capture_sessions.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {r.capture_sessions.pageType}
                </span>
                <time className="text-xs text-zinc-500">
                  {r.capture_sessions.capturedAt?.toLocaleString?.() ?? ""}
                </time>
              </div>
              <p className="mt-1 break-all text-xs text-zinc-600 dark:text-zinc-400">
                {r.capture_sessions.sourceUrl}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Contact:{" "}
                {r.contacts?.fullName ?? r.contacts?.linkedinUrlCanonical ?? "—"}
              </p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
