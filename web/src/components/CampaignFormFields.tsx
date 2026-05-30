"use client";

import Link from "next/link";
import { CopyFieldAssistant } from "@/components/CopyFieldAssistant";

type CampaignFormFieldsProps = {
  submitLabel: string;
  err?: boolean;
  defaultName?: string;
  defaultContext?: string;
  defaultWriter?: string;
  defaultSystemOverride?: string;
  hiddenCampaignId?: string;
};

export function CampaignFormFields({
  submitLabel,
  err,
  defaultName = "",
  defaultContext = "",
  defaultWriter = "",
  defaultSystemOverride = "",
  hiddenCampaignId,
}: CampaignFormFieldsProps) {
  return (
    <>
      {err ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Name and context are required.
        </p>
      ) : null}

      <p className="text-sm text-[var(--clin-muted)]">
        Use the <strong className="text-[var(--clin-text)]">copy assistant</strong> on
        each field: pick B2B, B2C, or Growth, add a short brief, then generate. Configure
        inference in{" "}
        <Link href="/settings" className="clin-link">
          Settings
        </Link>
        .
      </p>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
          Name
        </span>
        <CopyFieldAssistant
          field="campaign_name"
          textareaId="campaign-name"
          compact
        />
        <input
          id="campaign-name"
          name="name"
          required
          defaultValue={defaultName}
          className="mt-1 w-full clin-input text-sm"
          placeholder="e.g. Q2 partner intros"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
          Campaign context
        </span>
        <CopyFieldAssistant
          field="campaign_context"
          textareaId="campaign-context"
          contextFieldIds={["campaign-name"]}
        />
        <textarea
          id="campaign-context"
          name="contextText"
          required
          rows={8}
          defaultValue={defaultContext}
          className="mt-1 w-full clin-input text-sm"
          placeholder="What you’re offering, why now, proof points, who you help…"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
          Writer instructions (optional)
        </span>
        <CopyFieldAssistant
          field="campaign_writer"
          textareaId="campaign-writer"
          contextFieldIds={["campaign-name", "campaign-context"]}
          compact
        />
        <textarea
          id="campaign-writer"
          name="writerInstructions"
          rows={5}
          defaultValue={defaultWriter}
          className="mt-1 w-full clin-input text-sm"
          placeholder="Tone, length, must-mention, avoid, CTA…"
        />
      </label>

      <details className="clin-card p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Advanced: custom system prompt (optional)
        </summary>
        <p className="mt-2 text-xs text-[var(--clin-muted)]">
          Replaces the default JSON instruction for per-contact drafts. Still require{" "}
          <code className="clin-code">{"{\"message\":\"...\"}"}</code> only.
        </p>
        <textarea
          name="systemPromptOverride"
          rows={6}
          defaultValue={defaultSystemOverride}
          className="mt-2 w-full clin-input font-mono text-xs"
          placeholder="Leave empty for Clin’s default outreach system prompt."
        />
      </details>

      {hiddenCampaignId ? (
        <input type="hidden" name="campaignId" value={hiddenCampaignId} />
      ) : null}

      <button type="submit" className="clin-btn-primary">
        {submitLabel}
      </button>
    </>
  );
}
