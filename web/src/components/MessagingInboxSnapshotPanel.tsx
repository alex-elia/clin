import Link from "next/link";
import type { MessagingInboxSnapshotView } from "@/lib/messagingInboxSnapshot";

function displayName(row: MessagingInboxSnapshotView["rows"][0]): string {
  return row.contactName ?? row.participantName ?? "Unknown contact";
}

export function MessagingInboxSnapshotPanel({
  snapshot,
  capturedContactIds,
}: {
  snapshot: MessagingInboxSnapshotView;
  capturedContactIds: Set<string>;
}) {
  const hasRows = snapshot.rows.length > 0;

  return (
    <section className="clin-callout">
      <h2 className="text-sm font-semibold">Messaging list snapshot</h2>
      <p className="mt-1 text-xs text-clin-muted">
        {snapshot.tileCount} conversation{snapshot.tileCount === 1 ? "" : "s"} ·{" "}
        {snapshot.parseMode} · captured {snapshot.capturedAt.toLocaleString()}
      </p>

      {snapshot.parseWarning ? (
        <p className="mt-3 rounded-md border border-amber-400/50 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/35 dark:text-amber-100">
          {snapshot.parseWarning}
        </p>
      ) : null}

      {snapshot.note && !snapshot.parseWarning ? (
        <p className="mt-2 text-xs text-clin-muted">{snapshot.note}</p>
      ) : null}

      {!hasRows ? (
        <p className="mt-4 text-sm text-clin-muted">
          No conversations parsed. Open{" "}
          <a
            href="https://www.linkedin.com/messaging/"
            target="_blank"
            rel="noreferrer"
            className="clin-link"
          >
            linkedin.com/messaging
          </a>
          , wait for the thread list to load, then use the extension{" "}
          <strong className="font-medium">Snapshot messaging list</strong>.
        </p>
      ) : (
        <ul className="mt-4 max-h-96 space-y-2 overflow-y-auto">
          {snapshot.rows.map((r, i) => {
            const name = displayName(r);
            const showUnknownHint = !r.participantName && !r.contactName;

            return (
              <li
                key={`${name}-${r.timeLabel ?? i}`}
                className="clin-input text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {r.contactId ? (
                          <Link href={`/contacts/${r.contactId}`} className="clin-link">
                            {name}
                          </Link>
                        ) : (
                          name
                        )}
                      </span>
                      {r.fromMe ? (
                        <span className="text-[10px] uppercase tracking-wide text-clin-muted">
                          You wrote last
                        </span>
                      ) : null}
                      {r.unread ? (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700">
                          Unread
                        </span>
                      ) : null}
                    </div>

                    {r.preview ? (
                      <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-clin-muted">
                        {r.preview.replace(/^You:\s*/i, "")}
                      </p>
                    ) : showUnknownHint ? (
                      <p className="mt-1 text-xs text-clin-muted">
                        Name not detected — re-snapshot on linkedin.com/messaging after
                        reloading the extension.
                      </p>
                    ) : null}
                  </div>

                  {r.timeLabel ? (
                    <span className="shrink-0 rounded bg-clin-surface-muted px-2 py-0.5 text-[11px] text-clin-muted">
                      {r.timeLabel}
                    </span>
                  ) : null}
                </div>

                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  {r.contactId && capturedContactIds.has(r.contactId) ? (
                    <span className="text-emerald-700">Thread captured</span>
                  ) : r.contactId ? (
                    <span className="text-amber-700">Not thread-captured yet</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
