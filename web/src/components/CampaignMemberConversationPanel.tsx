"use client";

import { useState } from "react";
import {
  closeCampaignMemberAction,
  syncMemberReplyFromThreadAction,
  updateMemberReplyOutcomeAction,
} from "@/app/actions";
import { InboxMessageHistory } from "@/components/InboxMessageHistory";
import { InboxThreadCoach } from "@/components/InboxThreadCoach";
import type { MemberOutreachExtras } from "@/lib/campaignMemberOutreachShared";
import { REPLY_OUTCOME_LABELS } from "@/lib/campaignMemberMessagingShared";
import {
  adviseEndCampaign,
  CLOSE_REASON_LABELS,
  deriveMemberWorkflowPhase,
  WORKFLOW_PHASE_LABELS,
  workflowPhaseBadgeClass,
  type CampaignCloseReason,
} from "@/lib/campaignMemberWorkflowShared";
import type {
  InboxThreadAnalysis,
  StoredThreadAnalysis,
} from "@/lib/inboxThreadAnalysisTypes";
import type { MergedMessagingThread } from "@/lib/messagingTypes";
import {
  deriveReplyStateFromPastedText,
  estimatePastedMessageCount,
  MANUAL_PASTE_THREAD_KEY,
} from "@/lib/pastedThreadText";

type Props = {
  campaignId: string;
  memberId: string;
  contactId: string;
  contactName: string;
  memberStatus: string;
  thread: MergedMessagingThread | null;
  extras?: MemberOutreachExtras;
  storedCaptureAnalysis?: StoredThreadAnalysis | null;
  storedPastedAnalysis?: StoredThreadAnalysis | null;
  initialPastedThread?: string;
};

function formatClientDate(
  value: Date | string | null | undefined,
): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function CampaignMemberConversationPanel({
  campaignId,
  memberId,
  contactId,
  contactName,
  memberStatus,
  thread,
  extras,
  storedCaptureAnalysis,
  storedPastedAnalysis,
  initialPastedThread = "",
}: Props) {
  const [pasted, setPasted] = useState(initialPastedThread);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  if (
    memberStatus !== "sent" &&
    memberStatus !== "skipped" &&
    memberStatus !== "closed"
  ) {
    return null;
  }

  const captureAnalysis: InboxThreadAnalysis | null =
    storedCaptureAnalysis?.analysis ?? null;
  const workflowPhase = deriveMemberWorkflowPhase({
    memberStatus,
    extras,
    thread,
    threadAnalysis: captureAnalysis,
  });
  const endAdvice = adviseEndCampaign({
    memberStatus,
    extras,
    threadAnalysis: captureAnalysis,
  });
  const isClosed = memberStatus === "closed";
  const closeReason = (extras?.closeReason ?? "manual") as CampaignCloseReason;

  const pastedTrimmed = pasted.trim();
  const pastedReady = pastedTrimmed.length >= 40;
  const pastedReply = pastedReady
    ? deriveReplyStateFromPastedText(pastedTrimmed)
    : null;
  const pastedMessageCount = pastedReady
    ? estimatePastedMessageCount(pastedTrimmed)
    : 0;

  async function savePastedThread() {
    setSaveState("saving");
    setSaveError(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llm_message_context: pastedTrimmed || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data?.error || `HTTP ${res.status}`);
        setSaveState("error");
        return;
      }
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      setSaveState("error");
    }
  }

  return (
    <div className="mt-4 border-t border-[var(--clin-border)] pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-clin-muted">
          Conversation
        </h4>
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${workflowPhaseBadgeClass(workflowPhase)}`}
        >
          {WORKFLOW_PHASE_LABELS[workflowPhase]}
        </span>
        {isClosed && extras && formatClientDate(extras.closedAt) ? (
          <span className="text-[11px] text-clin-muted">
            Ended {formatClientDate(extras.closedAt)}
            {extras.closeReason
              ? ` · ${CLOSE_REASON_LABELS[closeReason] ?? extras.closeReason}`
              : null}
          </span>
        ) : null}
      </div>

      {endAdvice.suggest && !isClosed ? (
        <div className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50/80 p-3 text-sm dark:border-amber-800/50 dark:bg-amber-950/30">
          <p className="font-medium text-amber-950 dark:text-amber-100">
            Coach suggests ending this campaign
          </p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
            {endAdvice.reason}
          </p>
        </div>
      ) : null}

      {thread ? (
        <>
          {formatClientDate(thread.lastCapturedAt) ? (
            <p className="mt-1 text-[11px] text-clin-muted">
              Last capture: {formatClientDate(thread.lastCapturedAt)}
            </p>
          ) : null}

          {thread.replyState.lastPreview ? (
            <p className="mt-2 line-clamp-2 text-sm text-clin-muted">
              Latest: {thread.replyState.lastPreview}
            </p>
          ) : null}

          <InboxMessageHistory messages={thread.messages} />

          <InboxThreadCoach
            contactId={contactId}
            threadKey={thread.threadKey}
            contactName={contactName}
            needsReply={thread.replyState.needsReply}
            messageCount={thread.messageCount}
            captureCount={thread.captureCount}
            stored={
              storedCaptureAnalysis
                ? {
                    analysis: storedCaptureAnalysis.analysis,
                    analyzedAt: storedCaptureAnalysis.analyzedAt.toISOString(),
                    model: storedCaptureAnalysis.model,
                    messageCount: storedCaptureAnalysis.messageCount,
                  }
                : null
            }
            autoRun={!isClosed && !storedCaptureAnalysis?.analysis}
          />
        </>
      ) : (
        <p className="mt-2 text-sm text-clin-muted">
          No extension capture yet — paste the thread below to run the sales
          analyst, or use{" "}
          <strong className="font-medium text-clin-text">Capture (auto)</strong>{" "}
          in the extension.
        </p>
      )}

      {!isClosed ? (
        <div className="mt-4 rounded-lg border border-clin-border bg-clin-surface-muted/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-clin-muted">
            Paste conversation
          </p>
          <p className="mt-1 text-[11px] text-clin-muted">
            Copy messages from LinkedIn. Label lines with{" "}
            <code className="text-[10px]">Me:</code> and{" "}
            <code className="text-[10px]">Them:</code> when you can — helps reply
            detection.
          </p>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={8}
            placeholder={`Me: Hi Alex — saw your post on…\nThem: Thanks! Happy to chat…\nMe: …`}
            className="mt-2 w-full clin-input font-mono text-xs leading-relaxed"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void savePastedThread()}
              disabled={saveState === "saving" || !pastedTrimmed}
              className="clin-btn-secondary text-xs px-2 py-1 disabled:opacity-50"
            >
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : "Save thread"}
            </button>
            {saveError ? (
              <span className="text-xs text-red-600 dark:text-red-400">
                {saveError}
              </span>
            ) : null}
          </div>

          {pastedReady ? (
            <InboxThreadCoach
              contactId={contactId}
              threadKey={MANUAL_PASTE_THREAD_KEY}
              contactName={contactName}
              needsReply={pastedReply!.needsReply}
              messageCount={pastedMessageCount}
              captureCount={0}
              pastedThreadText={pastedTrimmed}
              stored={
                storedPastedAnalysis
                  ? {
                      analysis: storedPastedAnalysis.analysis,
                      analyzedAt:
                        storedPastedAnalysis.analyzedAt.toISOString(),
                      model: storedPastedAnalysis.model,
                      messageCount: storedPastedAnalysis.messageCount,
                    }
                  : null
              }
              autoRun={!storedPastedAnalysis?.analysis}
            />
          ) : pastedTrimmed.length > 0 ? (
            <p className="mt-2 text-xs text-clin-muted">
              Add a bit more text (at least ~40 characters) to enable analysis.
            </p>
          ) : null}
        </div>
      ) : null}

      {memberStatus === "sent" ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          {thread ? (
            <form action={syncMemberReplyFromThreadAction}>
              <input type="hidden" name="campaignId" value={campaignId} />
              <input type="hidden" name="memberId" value={memberId} />
              <button type="submit" className="clin-btn-secondary text-xs px-2 py-1">
                Sync reply status
              </button>
            </form>
          ) : null}
          <form
            action={updateMemberReplyOutcomeAction}
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="memberId" value={memberId} />
            <label className="text-xs">
              <span className="font-medium text-clin-text">Reply status</span>
              <select
                name="replyOutcome"
                defaultValue={extras?.messageReplyOutcome ?? "unknown"}
                className="mt-0.5 clin-select text-xs"
              >
                {Object.entries(REPLY_OUTCOME_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-[12rem] flex-1 text-xs">
              <span className="font-medium text-clin-text">Note</span>
              <input
                name="messageOutcomeNote"
                type="text"
                defaultValue={extras?.messageOutcomeNote ?? ""}
                placeholder="What they said, next step…"
                className="mt-0.5 clin-input text-xs"
              />
            </label>
            <button type="submit" className="clin-btn-primary text-xs px-2 py-1">
              Save
            </button>
          </form>
        </div>
      ) : null}

      {memberStatus === "sent" ? (
        <div className="mt-4 rounded-lg border border-zinc-300/70 bg-zinc-50/60 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-clin-muted">
            End campaign for this contact
          </p>
          <p className="mt-1 text-[11px] text-clin-muted">
            Stops active outreach tracking. Conversation history stays in Clin.
          </p>
          <form
            action={closeCampaignMemberAction}
            className="mt-2 flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="memberId" value={memberId} />
            <label className="text-xs">
              <span className="font-medium text-clin-text">Reason</span>
              <select
                name="closeReason"
                defaultValue={endAdvice.suggestedCloseReason}
                className="mt-0.5 clin-select text-xs"
              >
                {Object.entries(CLOSE_REASON_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-[12rem] flex-1 text-xs">
              <span className="font-medium text-clin-text">Closing note</span>
              <input
                name="messageOutcomeNote"
                type="text"
                defaultValue={
                  endAdvice.suggest ? endAdvice.reason.slice(0, 500) : ""
                }
                placeholder="Why you ended outreach…"
                className="mt-0.5 clin-input text-xs"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-white dark:bg-zinc-600"
            >
              End campaign
            </button>
          </form>
        </div>
      ) : isClosed && extras?.messageOutcomeNote ? (
        <p className="mt-3 text-xs text-clin-muted">
          Closing note: {extras.messageOutcomeNote}
        </p>
      ) : null}
    </div>
  );
}
