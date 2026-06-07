"use client";

import { useEffect, useState } from "react";
import { clinFetch } from "@/lib/clinFetch";

export function TelemetryConsentDialog() {
  const [show, setShow] = useState(false);
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await clinFetch("/api/telemetry/needs-consent");
      const data = await res.json();
      if (data.needed) {
        setShow(true);
      }
    })();
  }, []);

  if (!show) return null;

  const handleDecision = async (consent: boolean) => {
    setDeciding(true);
    try {
      const res = await fetch("/api/telemetry/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setShow(false);
    } catch (e) {
      console.error("Failed to save consent:", e);
      setDeciding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg border border-[var(--clin-border)] bg-[var(--clin-bg)] p-6 shadow-xl">
        <h2 className="text-xl font-semibold text-[var(--clin-text)]">
          Help improve Clin
        </h2>
        <div className="mt-4 space-y-3 text-sm text-[var(--clin-muted)]">
          <p>
            Share anonymous usage data to help us understand which features work
            and which AI orchestrations need improvement.
          </p>
          <div className="rounded border border-[var(--clin-border)]/60 bg-[var(--clin-bg-secondary)] p-3">
            <p className="font-medium text-[var(--clin-text)]">
              What we collect:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Feature usage counts (captures, autopilot runs)</li>
              <li>AI model performance (latency, errors)</li>
              <li>Orchestration metrics (batch sizes, durations)</li>
            </ul>
          </div>
          <div className="rounded border border-amber-700/30 bg-amber-50 p-3 dark:bg-amber-950/30">
            <p className="font-medium text-[var(--clin-text)]">Never collected:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Contact names, LinkedIn profiles, or personal data</li>
              <li>Message content or drafts you generate</li>
              <li>Anything that could identify your contacts</li>
            </ul>
          </div>
          <p className="text-xs">
            All events stay local until cloud sync is enabled in a future release. You
            can opt out anytime in Settings → Usage telemetry.
          </p>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => void handleDecision(false)}
            disabled={deciding}
            className="flex-1 rounded border border-[var(--clin-border)] px-4 py-2 text-sm font-medium text-[var(--clin-text)] hover:bg-[var(--clin-bg-secondary)] disabled:opacity-50"
          >
            No thanks
          </button>
          <button
            type="button"
            onClick={() => void handleDecision(true)}
            disabled={deciding}
            className="flex-1 rounded bg-[var(--clin-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {deciding ? "Saving…" : "Share anonymously"}
          </button>
        </div>
      </div>
    </div>
  );
}
