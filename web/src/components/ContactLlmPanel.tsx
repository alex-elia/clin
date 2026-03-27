"use client";

import { useState } from "react";

type Props = {
  contactId: string;
  ruleScores: { r: number; b: number; c: number };
  initialMessage: string;
  initialProvisional: string | null;
  initialRefined: string | null;
  ollamaBase: string;
  ollamaModel: string;
};

function prettyJson(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function ContactLlmPanel({
  contactId,
  ruleScores,
  initialMessage,
  initialProvisional,
  initialRefined,
  ollamaBase,
  ollamaModel,
}: Props) {
  const [message, setMessage] = useState(initialMessage);
  const [tier, setTier] = useState<"auto" | "provisional" | "refined">("auto");
  const [persist, setPersist] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provisional, setProvisional] = useState(initialProvisional);
  const [refined, setRefined] = useState(initialRefined);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          messageContext: message,
          persistMessageContext: persist,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `HTTP ${res.status}`);
        return;
      }
      const c = data.contact as {
        llmProvisionalJson?: string | null;
        llmRefinedJson?: string | null;
        llmMessageContext?: string | null;
      };
      if (c.llmProvisionalJson !== undefined) setProvisional(c.llmProvisionalJson);
      if (c.llmRefinedJson !== undefined) setRefined(c.llmRefinedJson);
      if (persist && typeof c.llmMessageContext === "string") {
        setMessage(c.llmMessageContext);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Local LLM analysis (Ollama)
      </h2>
      <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        Rule-based R/B/C above stay the source of truth for segments and queue. The
        model adds its own scores plus rationale and suggested next steps. With thin
        data (list capture only), use <strong>auto</strong> or{" "}
        <strong>provisional</strong>; after a full profile visit (and optional message
        paste), run again — <strong>auto</strong> usually picks{" "}
        <strong>refined</strong>.
      </p>
      <p className="text-xs text-zinc-500">
        Endpoint: <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">{ollamaBase}</code>{" "}
        · Model: <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">{ollamaModel}</code>{" "}
        · Change in{" "}
        <a href="/settings" className="underline">
          Settings
        </a>{" "}
        or <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">OLLAMA_*</code> env.
      </p>

      <div className="rounded-md bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-900/80">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">
          Rule scores (deterministic):{" "}
        </span>
        <span className="font-mono text-zinc-600 dark:text-zinc-400">
          R{ruleScores.r} B{ruleScores.b} C{ruleScores.c}
        </span>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-zinc-700 dark:text-zinc-300">
          Message thread (optional, local only)
        </span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          placeholder="Paste a recent LinkedIn DM thread or notes. Never synced to a cloud unless you configure one."
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={persist}
          onChange={(e) => setPersist(e.target.checked)}
        />
        Save message text on this contact for next runs
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-zinc-700 dark:text-zinc-300">Analysis tier</span>
        <select
          value={tier}
          onChange={(e) =>
            setTier(e.target.value as "auto" | "provisional" | "refined")
          }
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        >
          <option value="auto">Auto (from captures + message length)</option>
          <option value="provisional">Provisional (expect thin data)</option>
          <option value="refined">Refined (expect profile + context)</option>
        </select>
      </label>

      <button
        type="button"
        disabled={loading}
        onClick={() => void runAnalysis()}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {loading ? "Calling Ollama… (can take 1–2 min)" : "Run Ollama analysis"}
      </button>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Last provisional
          </h3>
          {prettyJson(provisional) ? (
            <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-zinc-900 p-3 text-[11px] leading-relaxed text-zinc-100">
              {prettyJson(provisional)}
            </pre>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">None yet.</p>
          )}
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Last refined
          </h3>
          {prettyJson(refined) ? (
            <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-zinc-900 p-3 text-[11px] leading-relaxed text-zinc-100">
              {prettyJson(refined)}
            </pre>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">None yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
