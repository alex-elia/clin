"use client";

import { useState } from "react";
import { setContactSegmentOverrideAction } from "@/app/actions";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { appendTranscriptToText } from "@/lib/speechRecognition";

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
  return "border-clin-border bg-clin-surface-muted";
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
    <section className="space-y-6 clin-card p-5">
      <div>
        <h2 className="text-sm font-semibold text-clin-text">
          Message history → should I drop this contact?
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-clin-muted">
          Clin cannot read LinkedIn for you. Paste a recent thread below, then run analysis. The local
          model returns a <strong className="clin-strong">lean</strong>{" "}
          (not a verdict): keep, consider removing, or unclear. You still remove connections on LinkedIn
          yourself if you want.
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs text-clin-muted">
          <li>
            Open{" "}
            <a
              href="https://www.linkedin.com/messaging/"
              target="_blank"
              rel="noreferrer"
              className="clin-link font-medium"
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
            Choose analysis tier if needed, then <strong className="font-medium">Run LLM analysis</strong>. If
            the thread is long, use <strong className="font-medium">Refined</strong>.
          </li>
        </ol>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="clin-strong">
          Pasted message thread (local only, optional but needed for removal advice)
        </span>
        <div className="clin-voice-field">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={12}
            placeholder={`Speak or paste the thread…\nYou: Hi — loved your post on …\nThem: Thanks!`}
            className="min-h-0 flex-1 w-full clin-input font-mono text-xs leading-relaxed"
          />
          <VoiceInputButton
            size="sm"
            label="Voice thread paste"
            onAppend={(text) =>
              setMessage((m) => appendTranscriptToText(m, text))
            }
          />
        </div>
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-clin-muted">
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
          <h3 className="text-sm font-semibold text-clin-text">
            {stewardshipTitle(stewardship)}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-clin-text">
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
                className="clin-btn-secondary text-xs px-3 py-1.5"
              >
                Tag in Clin: warm
              </button>
            </form>
          </div>
          <p className="mt-3 text-[11px] text-clin-muted">
            Tags only change Clin&apos;s segment — they do not unfollow or remove anyone on LinkedIn.
          </p>
        </div>
      ) : message.trim().length > 0 && message.trim().length < 40 ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          Tip: paste a bit more of the thread (40+ characters) so auto tier can treat this as refined context.
        </p>
      ) : null}

      <div className="border-t border-clin-border pt-5">
        <h2 className="text-sm font-semibold text-clin-text">
          Full LLM analysis
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-clin-muted">
          Rule-based R/B/C above stay the source of truth for default segments until you override. The model adds
          scores, rationale, and suggested actions.
        </p>
        <p className="mt-2 text-xs text-clin-muted">
          Active inference:{" "}
          <code className="clin-code">{ollamaBase}</code> · Model:{" "}
          <code className="clin-code">{ollamaModel}</code> ·{" "}
          <a href="/settings" className="clin-link">
            Settings
          </a>
        </p>

        <div className="mt-3 rounded-md bg-clin-surface-muted px-3 py-2 text-xs">
          <span className="font-medium text-clin-muted">
            Rule scores (deterministic):{" "}
          </span>
          <span className="font-mono text-clin-muted">
            R{ruleScores.r} B{ruleScores.b} C{ruleScores.c}
          </span>
        </div>

        <label className="mt-4 block space-y-1 text-sm">
          <span className="text-clin-muted">Analysis tier</span>
          <select
            value={tier}
            onChange={(e) =>
              setTier(e.target.value as "auto" | "provisional" | "refined")
            }
            className="w-full clin-input"
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
          className="mt-4 clin-btn-primary disabled:opacity-50"
        >
          {loading ? "Running inference… (can take 1–2 min)" : "Run LLM analysis"}
        </button>

        {error ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-clin-muted">
              Last provisional
            </h3>
            {prettyJson(provisional) ? (
              <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-clin-navy p-3 text-[11px] leading-relaxed text-white">
                {prettyJson(provisional)}
              </pre>
            ) : (
              <p className="mt-2 text-xs text-clin-muted">None yet.</p>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-clin-muted">
              Last refined
            </h3>
            {prettyJson(refined) ? (
              <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-clin-navy p-3 text-[11px] leading-relaxed text-white">
                {prettyJson(refined)}
              </pre>
            ) : (
              <p className="mt-2 text-xs text-clin-muted">None yet.</p>
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
