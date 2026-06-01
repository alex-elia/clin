type CampaignFormFieldsProps = {
  submitLabel: string;
  err?: boolean;
  defaultName?: string;
  defaultContext?: string;
  defaultIcp?: string;
  defaultWriter?: string;
  defaultSystemOverride?: string;
  hiddenCampaignId?: string;
};

export function CampaignFormFields({
  submitLabel,
  err,
  defaultName = "",
  defaultContext = "",
  defaultIcp = "",
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
        Use <strong className="text-[var(--clin-text)]">Prepare this campaign</strong>{" "}
        above for a short voice or text brief — Clin will draft ICP, context, and
        contact suggestions. Edit fields here anytime.
      </p>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
          Name
        </span>
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
          ICP (ideal customer profile)
        </span>
        <textarea
          id="campaign-icp"
          name="icpText"
          rows={5}
          defaultValue={defaultIcp}
          className="mt-1 w-full clin-input text-sm"
          placeholder="Roles, industries, company size, geography, who to exclude…"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
          Campaign context
        </span>
        <textarea
          id="campaign-context"
          name="contextText"
          required
          rows={8}
          defaultValue={defaultContext}
          className="mt-1 w-full clin-input text-sm"
          placeholder="What you're offering, why now, proof points, CTA framing for DMs…"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
          Writer instructions (optional)
        </span>
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
          placeholder="Leave empty for Clin's default outreach system prompt."
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
