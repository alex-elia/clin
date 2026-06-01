import { NextResponse } from "next/server";
import { enqueueEditorialJob } from "@/lib/editorial/editorialJobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const jobId = await enqueueEditorialJob({
    type: "ingest_trends",
    runAfter: new Date(),
  });
  return NextResponse.json({ jobId, enqueued: true });
}
