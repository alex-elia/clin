"use client";

import { CopyFieldAssistant } from "@/components/CopyFieldAssistant";

type MeContextFieldsProps = {
  goalsDefault: string;
  positioningDefault: string;
  globalWriterDefault: string;
  saveGoalsAction: (formData: FormData) => void | Promise<void>;
  saveGlobalWriterAction: (formData: FormData) => void | Promise<void>;
};

export function MeContextFields({
  goalsDefault,
  positioningDefault,
  globalWriterDefault,
  saveGoalsAction,
  saveGlobalWriterAction,
}: MeContextFieldsProps) {
  return (
    <>
      <form action={saveGoalsAction} className="clin-card space-y-5 p-5">
        <h2 className="clin-section-title">Edit goals &amp; positioning</h2>
        <p className="text-xs text-[var(--clin-muted)]">
          Pick B2B, B2C, or Growth and a short brief per field, or use full-profile
          full-profile generation above.
        </p>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-[var(--clin-text)]">
            Goals &amp; constraints
          </span>
          <CopyFieldAssistant
            field="user_goals"
            textareaId="goals-text"
            compact
          />
          <textarea
            id="goals-text"
            name="goalsText"
            rows={6}
            defaultValue={goalsDefault}
            placeholder="Filled by AI above, or type your own."
            className="mt-1 clin-input"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium text-[var(--clin-text)]">
            Positioning summary
          </span>
          <CopyFieldAssistant
            field="user_positioning"
            textareaId="positioning-summary"
            contextFieldIds={["goals-text"]}
          />
          <textarea
            id="positioning-summary"
            name="positioningSummary"
            rows={8}
            defaultValue={positioningDefault}
            placeholder="Filled by AI above, or write by hand."
            className="mt-1 clin-input font-mono text-xs"
          />
        </label>

        <button type="submit" className="clin-btn-primary">
          Save edits
        </button>
      </form>

      <form action={saveGlobalWriterAction} className="clin-card space-y-3 p-5">
        <h2 className="text-lg font-medium text-[var(--clin-text)]">
          Voice for all campaign drafts
        </h2>
        <p className="text-sm text-[var(--clin-muted)]">
          Merged into every outreach draft. Goals and positioning above are
          separate.
        </p>
        <CopyFieldAssistant
          field="global_writer"
          textareaId="global-writer"
          contextFieldIds={["goals-text", "positioning-summary"]}
        />
        <textarea
          id="global-writer"
          name="globalWriterInstructions"
          rows={5}
          defaultValue={globalWriterDefault}
          placeholder="Tone, must-mention, avoid, length…"
          className="w-full rounded-md border border-[var(--clin-border)] px-3 py-2 text-sm"
        />
        <button type="submit" className="clin-btn-primary">
          Save global voice
        </button>
      </form>
    </>
  );
}
