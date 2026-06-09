import Link from "next/link";
import type { DailyReminderSummary } from "@/lib/dailyReminder";

export function DailyTasksPanel({ summary }: { summary: DailyReminderSummary }) {
  if (!summary.hasWork) {
    return (
      <section aria-label="Your turn today" className="clin-callout">
        <p className="text-sm text-[var(--clin-muted)]">
          Nothing waiting on you right now — Clin autopilot and captures can keep
          running in the background.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Your turn today">
      <h2 className="clin-section-title">Your turn today</h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-3">
        {summary.tasks.map((task) => (
          <li key={task.id} className="clin-card flex flex-col p-5">
            <h3 className="text-base font-semibold text-[var(--clin-text)]">
              {task.label}
              <span className="ml-1.5 text-sm font-normal tabular-nums text-[var(--clin-muted)]">
                {task.count}
              </span>
            </h3>
            <ul className="mt-3 flex-1 space-y-1 text-sm text-[var(--clin-muted)]">
              {task.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <Link
              href={task.href}
              className="mt-4 text-sm font-medium text-[var(--clin-accent)] hover:underline"
            >
              Open →
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
