import Link from "next/link";
import { listLlmCallLogs, type LlmCallLogEntry } from "@/lib/llm/llmCallLog";
import { resolveDataDirectory } from "@/lib/dataPaths";

type LlmCallLogPanelProps = {
  limit?: number;
  featureFilter?: string;
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function LogRow({ entry }: { entry: LlmCallLogEntry }) {
  return (
    <details className="rounded-md border border-[var(--clin-border)] bg-[var(--clin-surface-muted)]/40 p-3 text-xs">
      <summary className="cursor-pointer list-none font-medium text-[var(--clin-text)]">
        <span
          className={
            entry.ok
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-red-700 dark:text-red-300"
          }
        >
          {entry.ok ? "OK" : "ERR"}
        </span>
        {" · "}
        <span className="text-[var(--clin-accent)]">{entry.feature}</span>
        {" · "}
        {entry.model}
        {" · "}
        {entry.durationMs}ms
        {" · "}
        <span className="text-[var(--clin-muted)]">{formatTime(entry.at)}</span>
      </summary>
      <dl className="mt-2 space-y-1 text-[var(--clin-muted)]">
        <div>
          <dt className="inline font-medium text-[var(--clin-text)]">Provider: </dt>
          <dd className="inline">{entry.provider}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-[var(--clin-text)]">Prompt size: </dt>
          <dd className="inline">
            system {entry.systemChars} + user {entry.userChars} → response{" "}
            {entry.responseChars} chars
            {entry.inputTokens != null ? (
              <>
                {" "}
                · tokens {entry.inputTokens}+{entry.outputTokens ?? 0}
              </>
            ) : null}
            {entry.estimatedCostEur != null ? (
              <>
                {" "}
                · est. €{entry.estimatedCostEur.toFixed(4)}
              </>
            ) : null}
            {entry.creditsUsed != null ? (
              <> · {entry.creditsUsed} Tavily credit(s)</>
            ) : null}
          </dd>
        </div>
        {entry.error ? (
          <div>
            <dt className="font-medium text-red-700 dark:text-red-300">Error</dt>
            <dd className="mt-0.5 font-mono">{entry.error}</dd>
          </div>
        ) : null}
        {entry.meta && Object.keys(entry.meta).length > 0 ? (
          <div>
            <dt className="font-medium text-[var(--clin-text)]">Meta</dt>
            <dd className="mt-0.5 font-mono text-[10px]">
              {JSON.stringify(entry.meta)}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="font-medium text-[var(--clin-text)]">Response preview</dt>
          <dd className="mt-0.5 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed">
            {entry.responsePreview || "—"}
          </dd>
        </div>
      </dl>
    </details>
  );
}

export async function LlmCallLogPanel({
  limit = 35,
  featureFilter,
}: LlmCallLogPanelProps) {
  let logs = await listLlmCallLogs(limit);
  if (featureFilter) {
    logs = logs.filter((l) => l.feature === featureFilter);
  }
  const dataDir = resolveDataDirectory();

  return (
    <section className="clin-card space-y-4 p-6">
      <div>
        <h2 className="clin-section-title">AI call logs</h2>
        <p className="mt-1 text-sm text-[var(--clin-muted)]">
          Every local LLM request (coach, copy assistant, images, etc.) is appended to{" "}
          <code className="text-xs">{dataDir}/llm-call-log.jsonl</code>. Use this when
          autopilot or coach fails without a clear reason.
        </p>
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-[var(--clin-muted)]">
          No calls logged yet. Run the writing assistant or autopilot once, then refresh
          this page.
        </p>
      ) : (
        <ul className="space-y-2">
          {logs.map((entry) => (
            <li key={entry.id}>
              <LogRow entry={entry} />
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-[var(--clin-muted)]">
        API:{" "}
        <Link href="/api/llm/logs" className="clin-link" target="_blank">
          /api/llm/logs
        </Link>
        {" · "}
        Filter coach only:{" "}
        <Link href="/api/llm/logs?feature=brand_coach" className="clin-link" target="_blank">
          ?feature=brand_coach
        </Link>
      </p>
    </section>
  );
}
