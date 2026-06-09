"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clinFetch } from "@/lib/clinFetch";
import type { DailyReminderTask } from "@/lib/dailyReminder";

type SummaryResponse = {
  show: boolean;
  tasks: DailyReminderTask[];
  totalCount: number;
  hasWork: boolean;
};

export function DailyReminderBanner() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await clinFetch("/api/tasks/summary");
      if (!res.ok) return;
      const data = (await res.json()) as SummaryResponse;
      if (data.show && data.hasWork) {
        setSummary(data);
      }
    })();
  }, []);

  if (!summary) return null;

  const dismiss = async () => {
    setDismissing(true);
    try {
      await fetch("/api/tasks/dismiss", { method: "POST" });
      setSummary(null);
    } catch (e) {
      console.error("Failed to dismiss daily reminder:", e);
      setDismissing(false);
    }
  };

  return (
    <div
      className="border-b border-[var(--clin-border)] bg-[var(--clin-surface-muted)]"
      role="region"
      aria-label="Today's tasks"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--clin-accent)]">
              Your turn today
            </p>
            <p className="mt-1 text-sm text-[var(--clin-muted)]">
              {summary.totalCount === 1
                ? "1 item needs your attention."
                : `${summary.totalCount} items need your attention.`}
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {summary.tasks.map((task) => (
              <li key={task.id} className="clin-card p-3">
                <Link
                  href={task.href}
                  className="group block"
                >
                  <p className="text-sm font-semibold text-[var(--clin-text)] group-hover:text-[var(--clin-accent)]">
                    {task.label}
                    <span className="ml-1.5 tabular-nums text-[var(--clin-muted)]">
                      ({task.count})
                    </span>
                  </p>
                  <ul className="mt-2 space-y-0.5 text-xs text-[var(--clin-muted)]">
                    {task.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={() => void dismiss()}
          disabled={dismissing}
          className="shrink-0 self-start rounded border border-[var(--clin-border)] px-3 py-1.5 text-xs font-medium text-[var(--clin-muted)] hover:bg-[var(--clin-surface)] hover:text-[var(--clin-text)] disabled:opacity-50"
        >
          {dismissing ? "Dismissing…" : "Dismiss for today"}
        </button>
      </div>
    </div>
  );
}
