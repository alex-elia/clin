"use client";

import { useState } from "react";
import { setContactSegmentOverrideAction } from "@/app/actions";

type Props = {
  contactId: string;
  ruleScores: { r: number; b: number; c: number };
  initialMessage: string;
  initialProvisional: string | null;
  initialRefined: string | null;
  ollamaBase: string;
  ollamaModel: string;
};

type Stewardship = {
  recommendation: "keep" | "consider_removing" | "unclear";
  rationale: string;
};

function prettyJson(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function stewardshipFromEnvelope(env: unknown): Stewardship | null {
  if (!env || typeof env !== "object") return null;
  const o = env as Record<string, unknown>;
  const output = o.output;
  if (!output || typeof output !== "object") return null;
  const cs = (output as Record<string, unknown>).connection_stewardship;
  if (!cs || typeof cs !== "object") return null;
  const rec = (cs as Record<string, unknown>).recommendation;
  const rat = (cs as Record<string, unknown>).rationale;
  if (
    (rec === "keep" || rec === "consider_removing" || rec === "unclear") &&
    typeof rat === "string"
  ) {
    return { recommendation: rec, rationale: rat };
  }
  return null;
}

function stewardshipTitle(s: Stewardship): string {
  if (s.recommendation === "consider_removing") return "Lean: consider removing";
  if (s.recommendation === "keep") return "Lean: worth keeping";
  return "Unclear from this thread";
}

function stewardshipPanelClass(s: Stewardship): string {
  if (s.recommendation === "consider_removing") {
    return "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40";
  }
  if (s.recommendation === "keep") {
    return "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/35";
  }
  return "border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900/60";
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
  const [lastEnvelope, setLastEnvelope] = useState<unknown>(null);

  const stewardship =
    stewardshipFromEnvelope(lastEnvelope) ??
    stewardshipFromEnvelope(tryParseJson(refined ?? "")) ??
    stewardshipFromEnvelope(tryParseJson(provisional ?? ""));

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
      if (data?.envelope) setLastEnvelope(data.envelope);
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
    <section className="space-y-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Message history → should I drop this contact?
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          Clin cannot read LinkedIn for you. Paste a recent thread below, then run analysis. The local
          model returns a <strong className="font-medium text-zinc-800 dark:text-zinc-200">lean</strong>{" "}
          (not a verdict): keep, consider removing, or unclear. You still remove connections on LinkedIn
          yourself if you want.
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
          <li>
            Open{" "}
            <a
              href="https://www.linkedin.com/messaging/"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-sky-700 underline dark:text-sky-400"
            >
              LinkedIn Messaging
            </a>{" "}
            and open the conversation with this person.
          </li>
          <li>
            Select the messages you care about (your notes + theirs), <strong className="font-medium">copy</strong>,
            and <strong className="font-medium">paste</strong> into the box below. You can redact sensitive lines
            before pasting.
          </li>
          <li>
            Choose analysis tier if needed, then <strong className="font-medium">Run Ollama analysis</strong>. If
            the thread is long, use <strong className="font-medium">Refined</strong>.
          </li>
        </ol>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">
          Pasted message thread (local only, optional but needed for removal advice)
        </span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={12}
          placeholder={`Example:\nYou: Hi — loved your post on …\nThem: Thanks!\nYou: …follow-up…\n(no reply since 3 months)`}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={persist}
          onChange={(e) => setPersist(e.target.checked)}
        />
        Save this text on the contact for the next run
      </label>

      {stewardship ? (
        <div
          className={`rounded-lg border p-4 ${stewardshipPanelClass(stewardship)}`}
          role="status"
        >
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {stewardshipTitle(stewardship)}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
            {stewardship.rationale}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={setContactSegmentOverrideAction}>
              <input type="hidden" name="contactId" value={contactId} />
              <input type="hidden" name="segment" value="remove_candidate" />
              <button
                type="submit"
                className="rounded-md border border-amber-800/40 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-950/80 dark:text-amber-100 dark:hover:bg-amber-900/80"
              >
                Tag in Clin: remove candidate
              </button>
            </form>
            <form action={setContactSegmentOverrideAction}>
              <input type="hidden" name="contactId" value={contactId} />
              <input type="hidden" name="segment" value="warm" />
              <button
                type="submit"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
              >
                Tag in Clin: warm
              </button>
            </form>
          </div>
          <p className="mt-3 text-[11px] text-zinc-600 dark:text-zinc-400">
            Tags only change Clin&apos;s segment — they do not unfollow or remove anyone on LinkedIn.
          </p>
        </div>
      ) : message.trim().length > 0 && message.trim().length < 40 ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          Tip: paste a bit more of the thread (40+ characters) so auto tier can treat this as refined context.
        </p>
      ) : null}

      <div className="border-t border-zinc-200 pt-5 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Full LLM analysis (Ollama)
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          Rule-based R/B/C above stay the source of truth for default segments until you override. The model adds
          scores, rationale, and suggested actions.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Endpoint:{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">{ollamaBase}</code> · Model:{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">{ollamaModel}</code> ·{" "}
          <a href="/settings" className="underline">
            Settings
          </a>
        </p>

        <div className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-900/80">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            Rule scores (deterministic):{" "}
          </span>
          <span className="font-mono text-zinc-600 dark:text-zinc-400">
            R{ruleScores.r} B{ruleScores.b} C{ruleScores.c}
          </span>
        </div>

        <label className="mt-4 block space-y-1 text-sm">
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
            <option value="refined">Refined (profile + pasted thread)</option>
          </select>
        </label>

        <button
          type="button"
          disabled={loading}
          onClick={() => void runAnalysis()}
          className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {loading ? "Calling Ollama… (can take 1–2 min)" : "Run Ollama analysis"}
        </button>

        {error ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
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
      </div>
    </section>
  );
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
