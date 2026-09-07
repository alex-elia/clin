import Link from "next/link";
import {
  listQueueDecideItems,
  listQueueReadyOutreach,
  type QueueWithContact,
} from "@/lib/queries";
import { DecisionsBoard, type DecisionItem } from "./DecisionsBoard";

export const dynamic = "force-dynamic";

function toDecisionItem(r: QueueWithContact): DecisionItem {
  return {
    queueId: r.queue.id,
    contactId: r.contact.id,
    fullName: r.contact.fullName,
    headline: r.contact.headline,
    company: r.contact.company,
    linkedinUrl: r.contact.linkedinUrlCanonical,
    suggestedAction: r.queue.suggestedAction,
    draftOutreach: r.queue.draftOutreach,
  };
}

export default async function DecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const sp = await searchParams;
  const sort = sp.order === "cleanup" ? ("cleanup" as const) : ("priority" as const);
  const [decideRows, readyRows] = await Promise.all([
    listQueueDecideItems(sort),
    listQueueReadyOutreach(sort),
  ]);

  const decideItems = decideRows.map(toDecisionItem);
  const readyItems = readyRows.map(toDecisionItem);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="clin-page-title">Decisions</h1>
        <p className="mt-1 text-sm text-clin-muted">
          Prepare outreach <strong className="font-medium">before</strong> you
          use the browser or extension on LinkedIn. Approve drafts here; then
          copy from the Ready tab or fetch{" "}
          <code className="clin-code font-mono">
            GET /api/outreach/ready
          </code>{" "}
          (also includes your active{" "}
          <Link href="/campaigns" className="clin-link">
            Campaign
          </Link>{" "}
          ready rows).
        </p>
        <p className="mt-2 text-xs text-clin-muted">
          <Link href="/queue" className="clin-link">
            Review queue
          </Link>{" "}
          for non-outreach triage. Approved outreach leaves the queue list until
          sent.{" "}
          {sort === "cleanup" ? (
            <Link href="/decisions" className="clin-link">
              Default order
            </Link>
          ) : (
            <Link href="/decisions?order=cleanup" className="clin-link">
              Sort by cleanup first
            </Link>
          )}
          .
        </p>
      </div>

      <DecisionsBoard decideItems={decideItems} readyItems={readyItems} />
    </div>
  );
}
