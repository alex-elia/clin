import Link from "next/link";
import { updateInboxThreadAction } from "@/app/actions";
import { InboxMessageHistory } from "@/components/InboxMessageHistory";
import { InboxThreadCoach } from "@/components/InboxThreadCoach";
import type { InboxOverviewRow } from "@/lib/inbox";

export function InboxCapturedThreadCard({ row }: { row: InboxOverviewRow }) {
  return (
    <li className="clin-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link
            href={`/contacts/${row.contactId}`}
            className="font-medium hover:underline"
          >
            {row.fullName || row.contactId}
          </Link>
          <p className="mt-1 text-[11px] text-clin-muted">
            {row.messageCount} msgs · {row.captureCount} capture
            {row.captureCount === 1 ? "" : "s"} ·{" "}
            {row.lastCapturedAt.toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {row.needsReply ? (
            <span className="clin-pill border-amber-400/50 text-xs text-amber-900 dark:text-amber-100">
              Needs reply
            </span>
          ) : row.lastFrom === "me" ? (
            <span className="clin-pill text-xs text-clin-muted">You wrote last</span>
          ) : null}
          {row.state?.status && row.state.status !== "open" ? (
            <span className="clin-pill text-xs">{row.state.status}</span>
          ) : null}
        </div>
      </div>

      {row.preview ? (
        <p className="mt-2 line-clamp-3 text-sm text-clin-muted">{row.preview}</p>
      ) : null}

      <InboxMessageHistory messages={row.messages} />

      <InboxThreadCoach
        contactId={row.contactId}
        threadKey={row.threadKey}
        contactName={row.fullName ?? "Contact"}
        needsReply={row.needsReply}
        messageCount={row.messageCount}
        captureCount={row.captureCount}
      />

      <form action={updateInboxThreadAction} className="mt-3 flex flex-wrap gap-2">
        <input type="hidden" name="contactId" value={row.contactId} />
        <input type="hidden" name="threadKey" value={row.threadKey} />
        <select
          name="status"
          defaultValue={row.state?.status ?? "open"}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="open">Open</option>
          <option value="snoozed">Snooze</option>
          <option value="done">Done</option>
        </select>
        <input
          type="number"
          name="snoozeDays"
          min={1}
          max={30}
          defaultValue={1}
          className="w-16 rounded border px-2 py-1 text-sm"
        />
        <input
          type="text"
          name="note"
          defaultValue={row.state?.note ?? ""}
          placeholder="Note"
          className="min-w-[10rem] flex-1 rounded border px-2 py-1 text-sm"
        />
        <button type="submit" className="clin-btn-primary px-3 py-1 text-xs">
          Save
        </button>
      </form>
    </li>
  );
}
