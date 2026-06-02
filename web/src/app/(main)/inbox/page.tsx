import Link from "next/link";
import { InboxCapturedThreadCard } from "@/components/InboxCapturedThreadCard";
import { MessagingInboxSnapshotPanel } from "@/components/MessagingInboxSnapshotPanel";
import {
  listInboxOverview,
  type InboxThreadStatus,
} from "@/lib/inbox";
import { getLatestMessagingInboxSnapshot } from "@/lib/messagingInboxSnapshot";

export const dynamic = "force-dynamic";

const FILTERS: { key: "active" | "all" | InboxThreadStatus | "needs_reply"; label: string }[] =
  [
    { key: "active", label: "Active" },
    { key: "needs_reply", label: "Needs reply" },
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
    viewRaw === "active" ||
    viewRaw === "needs_reply"
      ? viewRaw
      : "active";
  const contactFilter = sp.contact?.trim() || undefined;

  const [rows, needsReplyRows] = await Promise.all([
    listInboxOverview({
      statusFilter:
        view === "needs_reply"
          ? "active"
          : (view as "active" | "all" | InboxThreadStatus),
      contactId: contactFilter,
      limit: 100,
      needsReplyOnly: view === "needs_reply",
    }),
    view === "needs_reply"
      ? Promise.resolve([])
      : listInboxOverview({
          statusFilter: "active",
          contactId: contactFilter,
          limit: 200,
          needsReplyOnly: true,
        }),
  ]);

  const listSnapshot = await getLatestMessagingInboxSnapshot();
  const capturedContactIds = new Set(rows.map((r) => r.contactId));
  const needsReplyCount =
    view === "needs_reply" ? rows.length : needsReplyRows.length;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div>
        <h1 className="clin-page-title">Inbox</h1>
        <p className="mt-2 text-sm leading-relaxed text-clin-muted">
          Open a 1:1 thread and use{" "}
          <strong className="font-medium">Capture</strong> in the extension, or
          run <strong className="font-medium">Snapshot messaging list</strong> on
          the inbox. Clin merges message history across captures and can suggest
          replies with your local LLM — it never sends messages on LinkedIn.
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
            {f.key === "needs_reply" && needsReplyCount > 0
              ? ` (${needsReplyCount})`
              : ""}
          </Link>
        ))}
      </div>

      {listSnapshot ? (
        <MessagingInboxSnapshotPanel
          snapshot={listSnapshot}
          capturedContactIds={capturedContactIds}
        />
      ) : null}

      <h2 className="text-sm font-semibold">Captured threads</h2>

      {rows.length === 0 ? (
        <p className="text-sm text-clin-muted">
          {view === "needs_reply"
            ? "No threads waiting for your reply."
            : "No threads yet."}
        </p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <InboxCapturedThreadCard key={`${r.contactId}-${r.threadKey}`} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
