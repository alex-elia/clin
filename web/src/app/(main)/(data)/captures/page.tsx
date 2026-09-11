import Link from "next/link";
import { contactPickerLabel } from "@/lib/contactDisplay";
import { listCaptures } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CapturesPage() {
  const rows = await listCaptures(50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="clin-page-title">Capture log</h1>
        <p className="mt-1 text-sm text-clin-muted">
          Profiles, posts, lists, and messaging threads. Snapshots:{" "}
          <Link href="/inbox" className="clin-link">
            Inbox
          </Link>
          ,{" "}
          <Link href="/analytics" className="clin-link">
            Analytics
          </Link>
          .
        </p>
      </div>

      <ul className="space-y-3">
        {rows.length === 0 ? (
          <li className="text-sm text-clin-muted">No captures yet.</li>
        ) : (
          rows.map((r) => (
            <li
              key={r.capture_sessions.id}
              className="clin-card p-4 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-clin-text">
                  {r.capture_sessions.pageType}
                </span>
                <time className="text-xs text-clin-muted">
                  {r.capture_sessions.capturedAt?.toLocaleString?.() ?? ""}
                </time>
              </div>
              <p className="mt-1 break-all text-xs text-clin-muted">
                {r.capture_sessions.sourceUrl}
              </p>
              <p className="mt-2 text-xs text-clin-muted">
                Contact:{" "}
                {r.contacts
                  ? contactPickerLabel(r.contacts)
                  : "—"}
              </p>
              {r.capture_sessions.fieldPresence ? (
                <p className="mt-1 font-mono text-[11px] text-clin-muted">
                  Fields:{" "}
                  {Object.entries(
                    r.capture_sessions.fieldPresence as Record<string, boolean>,
                  )
                    .filter(([, v]) => v)
                    .map(([k]) => k)
                    .join(", ") || "none"}
                </p>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
