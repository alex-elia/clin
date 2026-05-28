import Link from "next/link";
import { updateInboxThreadAction } from "@/app/actions";
import {
  listInboxOverview,
  type InboxThreadStatus,
} from "@/lib/inbox";
import { getLatestMessagingInboxSnapshot } from "@/lib/messagingInboxSnapshot";

export const dynamic = "force-dynamic";

const FILTERS: { key: "active" | "all" | InboxThreadStatus; label: string }[] =
  [
    { key: "active", label: "Active" },
    { key: "open", label: "Open" },
    { key: "snoozed", label: "Snoozed" },
    { key: "done", label: "Done" },
    { key: "all", label: "All threads" },
  ];

function chipClass(on: boolean) {
  return on ? "clin-pill clin-pill-active" : "clin-pill";
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; contact?: string }>;
}) {
  const sp = await searchParams;
  const viewRaw = (sp.view ?? "active").toLowerCase();
  const view =
    viewRaw === "all" ||
    viewRaw === "open" ||
    viewRaw === "done" ||
    viewRaw === "snoozed" ||
    viewRaw === "active"
      ? viewRaw
      : "active";
  const contactFilter = sp.contact?.trim() || undefined;

  const rows = await listInboxOverview({
    statusFilter: view as "active" | "all" | InboxThreadStatus,
    contactId: contactFilter,
    limit: 100,
  });

  const listSnapshot = await getLatestMessagingInboxSnapshot();
  const capturedContactIds = new Set(rows.map((r) => r.contactId));

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div>
        <h1 className="clin-page-title">Inbox</h1>
        <p className="mt-2 text-sm leading-relaxed text-clin-muted">
          Open a 1:1 thread and use{" "}
          <strong className="font-medium">Capture</strong> in the extension, or
          run <strong className="font-medium">Snapshot messaging list</strong> on
          the inbox. Clin does not poll LinkedIn or send messages.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={
              f.key === "active"
                ? `/inbox${contactFilter ? `?contact=${encodeURIComponent(contactFilter)}` : ""}`
                : `/inbox?view=${f.key}${contactFilter ? `&contact=${encodeURIComponent(contactFilter)}` : ""}`
            }
            className={chipClass(view === f.key)}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {listSnapshot && listSnapshot.rows.length > 0 ? (
        <section className="clin-callout">
          <h2 className="text-sm font-semibold">Messaging list snapshot</h2>
          <p className="mt-1 text-xs text-clin-muted">
            {listSnapshot.tileCount} rows · {listSnapshot.parseMode}
          </p>
          <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
            {listSnapshot.rows.map((r, i) => (
              <li
                key={`${r.participantName ?? "row"}-${i}`}
                className="clin-input text-sm"
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium">
                    {r.contactId ? (
                      <Link href={`/contacts/${r.contactId}`} className="clin-link">
                        {r.contactName ?? r.participantName}
                      </Link>
                    ) : (
                      (r.participantName ?? "Unknown")
                    )}
                  </span>
                  {r.timeLabel ? (
                    <span className="text-xs text-clin-muted">{r.timeLabel}</span>
                  ) : null}
                </div>
                {r.preview ? (
                  <p className="mt-1 line-clamp-2 text-xs text-clin-muted">{r.preview}</p>
                ) : null}
                {r.contactId && capturedContactIds.has(r.contactId) ? (
                  <span className="text-[11px] text-emerald-700">Thread captured</span>
                ) : r.contactId ? (
                  <span className="text-[11px] text-amber-700">Not thread-captured yet</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <h2 className="text-sm font-semibold">Captured threads</h2>

      {rows.length === 0 ? (
        <p className="text-sm text-clin-muted">No threads yet.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li
              key={`${r.contactId}-${r.threadKey}`}
              className="clin-card p-4"
            >
              <Link href={`/contacts/${r.contactId}`} className="font-medium hover:underline">
                {r.fullName || r.contactId}
              </Link>
              {r.preview ? (
                <p className="mt-2 line-clamp-3 text-sm text-clin-muted">
                  {r.preview}
                </p>
              ) : null}
              <form action={updateInboxThreadAction} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="contactId" value={r.contactId} />
                <input type="hidden" name="threadKey" value={r.threadKey} />
                <select name="status" defaultValue={r.state?.status ?? "open"} className="rounded border px-2 py-1 text-sm">
                  <option value="open">Open</option>
                  <option value="snoozed">Snooze</option>
                  <option value="done">Done</option>
                </select>
                <input type="number" name="snoozeDays" min={1} max={30} defaultValue={1} className="w-16 rounded border px-2 py-1 text-sm" />
                <input type="text" name="note" defaultValue={r.state?.note ?? ""} placeholder="Note" className="min-w-[10rem] flex-1 rounded border px-2 py-1 text-sm" />
                <button type="submit" className="clin-btn-primary text-xs px-3 py-1">
                  Save
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
