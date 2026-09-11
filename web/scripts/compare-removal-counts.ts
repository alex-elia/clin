import { getDb } from "@/db";
import { buildCleaningBoard } from "@/lib/cleaningBoard";
import { runNetworkHygienePipeline } from "@/lib/networkHygienePipeline";

async function main() {
  getDb();
  const [snapshot, board] = await Promise.all([
    runNetworkHygienePipeline(),
    buildCleaningBoard(),
  ]);

  const yes = snapshot.rows.filter(
    (r) => r.removeVerdict === "yes" && r.canDisconnect,
  );
  const yesNotReviewBucket = yes.filter((r) => r.bucket !== "review_remove");
  const yesNoLlm = yes.filter((r) => !r.hasLlmAnalysis);
  const yesRemoveSegment = yes.filter((r) => r.segment === "remove_candidate");

  console.log("Pipeline queueRemovalYesCount:", snapshot.actHints.queueRemovalYesCount);
  console.log("Pipeline yes rows:", yes.length);
  console.log("  in review_remove bucket:", yes.filter((r) => r.bucket === "review_remove").length);
  console.log("  segment remove_candidate:", yesRemoveSegment.length);
  console.log("  without LLM:", yesNoLlm.length);
  console.log("  yes but bucket NOT review_remove:", yesNotReviewBucket.length);
  console.log("Board review_remove bucket:", board.summary.bucketCounts.review_remove);
  console.log("Board total contacts in DB:", board.summary.totalContacts);
  console.log("Board scans only 400 most recently updated");

  const bucketBreakdown: Record<string, number> = {};
  for (const r of yesNotReviewBucket) {
    const b = r.bucket ?? "null";
    bucketBreakdown[b] = (bucketBreakdown[b] ?? 0) + 1;
  }
  console.log("Yes verdict but other buckets:", bucketBreakdown);

  console.log(
    "Sample:",
    yesNotReviewBucket.slice(0, 3).map((r) => ({
      name: r.fullName,
      segment: r.segment,
      bucket: r.bucket,
      hasLlm: r.hasLlmAnalysis,
      reasons: r.reasons,
    })),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
