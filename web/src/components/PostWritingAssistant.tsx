"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CoachChatComposer } from "@/components/CoachChatComposer";
import { CoachChatThread } from "@/components/CoachChatThread";
import { CoachDebugPanel } from "@/components/CoachDebugPanel";
import {
  isAdvisoryCoachReply,
  type BrandCoachTurnDebug,
} from "@/lib/coachDebug";
import { applyCoachPatchesToForm } from "@/lib/brandCoachClient";
import {
  COACH_LIMITS,
  truncateForCoach,
  trimCoachDraft,
} from "@/lib/coachContextLimits";
import {
  POST_WRITING_QUICK_PROMPTS_POST,
  POST_WRITING_QUICK_PROMPTS_STUDIO,
} from "@/lib/contentPostWorkflow";
import type { CoachAction } from "@/lib/brandCoachTypes";
import type { PostFormPatch } from "@/components/ContentPostWorkspace";

function llmRouteLabel(debug: BrandCoachTurnDebug): string {
  const provider =
    debug.provider === "openai_compatible" ? "Cloud" : "Ollama (local)";
  const tier =
    debug.modelTier === "reasoning"
      ? "reasoning"
      : debug.modelTier === "orchestrator"
        ? "fast"
        : null;
  const size =
    debug.contextChars != null ? ` · ${debug.contextChars} chars sent` : "";
  const route =
    debug.autoswitched && debug.modelRouteReason
      ? ` · auto (${debug.modelRouteReason})`
      : debug.modelRouteReason
        ? ` · ${debug.modelRouteReason}`
        : "";
  return `${provider}${tier ? ` · ${tier}` : ""} / ${debug.model}${size}${route}`;
}

export type CoachDraftPayload = {
  title?: string;
  format?: string;
  ideaNotes?: string;
  hook?: string;
  body?: string;
  articleBody?: string;
  language?: string;
};

type PostWritingAssistantProps = {
  postId?: string;
  coachDraft?: CoachDraftPayload;
  /** Prefer this over `coachDraft` — draft is read only when sending (avoids re-trim on every keystroke). */
  getCoachDraft?: () => CoachDraftPayload;
  /** `fr` | `en` | `auto` for speech recognition language */
  speechLanguage?: string | null;
  onApplyPatch: (patch: PostFormPatch) => void;
  /** Studio mode: planning only, no form fill */
  planningOnly?: boolean;
  /** Brand default language for studio quick prompts */
  brandLanguage?: string | null;
};

export function PostWritingAssistant({
  postId,
  coachDraft,
  getCoachDraft,
  speechLanguage,
  onApplyPatch,
  planningOnly = false,
  brandLanguage,
}: PostWritingAssistantProps) {
  const router = useRouter();
  const [threadId, setThreadId] = useState<string | undefined>();
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<CoachAction[]>([]);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [languageHint, setLanguageHint] = useState<string | null>(null);
  const [coachDebug, setCoachDebug] = useState<BrandCoachTurnDebug | null>(null);
  const [lastLlmRoute, setLastLlmRoute] = useState<string | null>(null);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (trimmed.length < 2 || loading) return;
    setLoading(true);
    setError(null);
    setCoachDebug(null);
    setStatusLine(null);
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setInput("");
    const draftSource = getCoachDraft?.() ?? coachDraft;
    const draftPayload = draftSource
      ? trimCoachDraft({ ...draftSource })
      : undefined;
    try {
      const res = await fetch("/api/branding/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          threadId,
          postId: planningOnly ? undefined : postId,
          scope: planningOnly ? "studio" : undefined,
          draft: draftPayload,
        }),
      });
      const data = (await res.json()) as {
        threadId?: string;
        reply?: string;
        actions?: CoachAction[];
        savedToDb?: boolean;
        appliedCount?: number;
        appliedFields?: string[];
        appliedPatch?: PostFormPatch;
        applyErrors?: string[];
        resolvedLanguage?: string;
        languageHint?: string;
        error?: string;
        debug?: BrandCoachTurnDebug;
      };
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        if (data.debug) {
          setCoachDebug(data.debug);
          setLastLlmRoute(llmRouteLabel(data.debug));
        }
        return;
      }
      if (data.threadId) setThreadId(data.threadId);
      if (data.debug) {
        setLastLlmRoute(llmRouteLabel(data.debug));
      }
      const reply = truncateForCoach(
        data.reply ?? "",
        COACH_LIMITS.replyDisplay,
        "reply",
      );

      if (data.savedToDb) {
        if (data.appliedPatch && !planningOnly && postId) {
          onApplyPatch(data.appliedPatch);
        }
        router.refresh();
        const fields =
          data.appliedFields?.length ? ` (${data.appliedFields.join(", ")})` : "";
        setPendingActions([]);
        setCoachDebug(
          data.debug?.parse.schemaValid === false ? data.debug : null,
        );
        setStatusLine(
          data.appliedCount
            ? `Saved ${data.appliedCount} update(s) to this post${fields}. The form below is updated.`
            : `Coach replied but no fields were saved${fields ? ` — tried: ${data.appliedFields?.join(", ")}` : ""}. See errors below.`,
        );
        if (data.applyErrors?.length) {
          setError(data.applyErrors.join(" "));
        } else if (!data.appliedCount) {
          setCoachDebug(data.debug ?? null);
          setError(
            "Coach sent updates but they could not be saved. See debug below or try Apply again.",
          );
        }
      } else if (!planningOnly && postId && data.actions?.length) {
        const filled = applyCoachPatchesToForm(
          data.actions,
          postId,
          onApplyPatch,
        );
        setPendingActions(data.actions);
        if (filled > 0) {
          setCoachDebug(
            data.debug?.parse.schemaValid === false ? data.debug : null,
          );
          setStatusLine(
            `Prefilled ${filled} field(s) in the form below. Click Apply to save to the database, or edit then Save.`,
          );
        } else {
          setCoachDebug(data.debug ?? null);
          setError(
            "Coach sent updates but they did not match this post. See debug below.",
          );
        }
      } else if (data.actions?.length) {
        setPendingActions(data.actions);
        setCoachDebug(null);
      } else if (planningOnly && isAdvisoryCoachReply(data.debug)) {
        setCoachDebug(null);
        setStatusLine(
          "Ideas in the reply above. To add calendar slots, say e.g. “Add these to my calendar for Tue/Thu” or use a quick prompt that mentions create_post.",
        );
      } else if (
        planningOnly &&
        data.reply?.trim() &&
        !data.debug?.parse.hasCoachActionsBlock
      ) {
        setCoachDebug(null);
        setStatusLine(
          "Reply above. When you want calendar changes, ask to add or reschedule posts — the coach will send Apply-able actions.",
        );
      } else if (data.debug?.parse.hasCoachActionsBlock) {
        setCoachDebug(data.debug ?? null);
        setError(
          planningOnly
            ? "Could not read calendar actions from the reply. See debug below."
            : "Coach wrote a reply but form updates could not be parsed. See debug below.",
        );
      } else if (data.debug && !isAdvisoryCoachReply(data.debug)) {
        setCoachDebug(data.debug);
        setError(
          planningOnly
            ? "Could not apply calendar changes. Try asking to add calendar slots with create_post."
            : "Coach replied but sent no form updates. See debug below.",
        );
      }

      setMessages((m) => {
        const next = [...m, { role: "assistant" as const, content: reply }];
        return next.length > 24 ? next.slice(-24) : next;
      });
      if (data.resolvedLanguage) {
        setLanguageHint(
          data.languageHint
            ? `${data.resolvedLanguage.toUpperCase()} (${data.languageHint})`
            : data.resolvedLanguage.toUpperCase(),
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed.";
      setError(
        msg.includes("fetch") || msg === "Failed to fetch"
          ? "Request failed before the server finished — often a browser tab memory limit with very large drafts. Check Settings → AI call logs (brand_coach) for the provider used; cloud calls should show openai_compatible."
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }, [input, loading, threadId, postId, planningOnly, coachDraft, getCoachDraft, onApplyPatch, router]);

  const applyAll = useCallback(async () => {
    if (!pendingActions.length || loading) return;
    setLoading(true);
    setError(null);

    if (!planningOnly && postId) {
      applyCoachPatchesToForm(pendingActions, postId, onApplyPatch);
    }

    try {
      const res = await fetch("/api/branding/coach/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: pendingActions }),
      });
      const data = (await res.json()) as {
        applied?: number;
        errors?: string[];
        createdPostIds?: string[];
      };
      if (!res.ok) {
        setError("Could not save suggestions.");
        return;
      }
      setPendingActions([]);
      setStatusLine(
        planningOnly
          ? `Applied ${data.applied ?? 0} change(s) to your calendar.`
          : `Filled the post form and saved ${data.applied ?? 0} update(s). Review below, then Save if you edited further.`,
      );
      if (data.createdPostIds?.[0] && planningOnly) {
        window.location.href = `/branding/posts/${data.createdPostIds[0]}`;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed.");
    } finally {
      setLoading(false);
    }
  }, [pendingActions, loading, onApplyPatch, postId, planningOnly]);

  const quickPrompts = planningOnly
    ? brandLanguage === "fr"
      ? [...POST_WRITING_QUICK_PROMPTS_STUDIO.fr]
      : [...POST_WRITING_QUICK_PROMPTS_STUDIO.en]
    : coachDraft?.language === "fr"
      ? [...POST_WRITING_QUICK_PROMPTS_POST.fr]
      : [...POST_WRITING_QUICK_PROMPTS_POST.en];

  return (
    <section
      data-tour="assistant"
      className="clin-card border-2 border-[var(--clin-accent)]/25 p-5"
    >
      <h2 className="clin-section-title">
        {planningOnly ? "Planning assistant" : "Writing assistant"}
      </h2>
      <p className="mt-1 text-sm text-[var(--clin-muted)]">
        {planningOnly ? (
          <>
            Plan the calendar: new slots, reschedule, briefs.{" "}
            <strong className="clin-strong">Apply</strong> saves pipeline changes.
            Full posts are written on each post page (autopilot or writing assistant
            there).
          </>
        ) : (
          <>
            Ask, iterate, and prefill title, schedule, hook, and full post.{" "}
            <strong className="clin-strong">Mic</strong> for voice (Chrome / Edge).{" "}
            <strong className="clin-strong">Apply</strong> fills the form.
          </>
        )}
      </p>
      {languageHint ? (
        <p className="mt-2 text-xs text-[var(--clin-muted)]">
          Language: {languageHint}
        </p>
      ) : null}
      {lastLlmRoute ? (
        <p className="mt-1 text-xs text-[var(--clin-muted)]">
          LLM route: {lastLlmRoute}
        </p>
      ) : null}

      <CoachChatThread
        messages={messages}
        loading={loading}
        assistantLabel={planningOnly ? "Planning" : "Assistant"}
      />

      {pendingActions.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--clin-accent)]/30 bg-[var(--clin-accent)]/5 px-3 py-2">
          <button
            type="button"
            className="clin-btn-primary"
            disabled={loading}
            onClick={() => void applyAll()}
          >
            Apply ({pendingActions.length})
          </button>
          <button
            type="button"
            className="clin-btn-secondary text-sm"
            onClick={() => setPendingActions([])}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {statusLine ? (
        <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">{statusLine}</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      {coachDebug ? <CoachDebugPanel debug={coachDebug} /> : null}

      <CoachChatComposer
        input={input}
        onInputChange={setInput}
        onSend={() => void send()}
        loading={loading}
        sendLabel="Ask"
        placeholder="Speak or type: voice note, full post request, or Q&A…"
        speechLanguage={speechLanguage ?? coachDraft?.language}
        quickPrompts={messages.length === 0 ? quickPrompts : undefined}
        onQuickPrompt={setInput}
      />
    </section>
  );
}
