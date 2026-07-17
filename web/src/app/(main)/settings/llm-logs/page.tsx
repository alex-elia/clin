import Link from "next/link";
import { LlmCallLogPanel } from "@/components/LlmCallLogPanel";

export const dynamic = "force-dynamic";

export default function LlmCallLogsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/settings" className="clin-link text-sm">
          ← Settings
        </Link>
        <h1 className="clin-page-title mt-2">AI call logs</h1>
        <p className="clin-page-lead">
          Recent local AI requests — useful when coaching or drafting fails.
        </p>
      </div>
      <LlmCallLogPanel />
    </div>
  );
}
