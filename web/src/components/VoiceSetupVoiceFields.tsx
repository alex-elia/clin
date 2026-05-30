"use client";

import { useCallback, useState, useTransition } from "react";
import { completeVoiceSetupAction, suggestVoiceSetupFromProfileAction } from "@/app/actions";
import { CopyFieldAssistant } from "@/components/CopyFieldAssistant";
import { CONTENT_LANGUAGE_PREF_LABELS, CONTENT_LANGUAGE_PREFS } from "@/lib/contentLanguage";

type VoiceSetupVoiceFieldsProps = {
  goalsDefault: string;
  positioningDefault: string;
  doctrineDefault: string;
  expertiseDefault: string;
  rhythmWeekdaysDefault: string;
  rhythmTimeDefault: string;
  contentLanguageDefault: string;
  profileReady: boolean;
  onBack: () => void;
};

function setFieldValue(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (el instanceof HTMLSelectElement) {
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

export function VoiceSetupVoiceFields({
  goalsDefault,
  positioningDefault,
  doctrineDefault,
  expertiseDefault,
  rhythmWeekdaysDefault,
  rhythmTimeDefault,
  contentLanguageDefault,
  profileReady,
  onBack,
}: VoiceSetupVoiceFieldsProps) {
  const [profileBrief, setProfileBrief] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fillFromProfile = useCallback(() => {
    setProfileError(null);
    startTransition(async () => {
      const result = await suggestVoiceSetupFromProfileAction(
        profileBrief.trim() || undefined,
      );
      if (!result.ok) {
        setProfileError(result.error);
        return;
      }
      setFieldValue("voice-goals-text", result.goalsText);
      setFieldValue("voice-positioning-summary", result.positioningSummary);
      setFieldValue("voice-content-doctrine", result.contentDoctrine);
      setFieldValue("voice-expertise-summary", result.expertiseSummary);
      setFieldValue("voice-rhythm-weekdays", result.rhythmWeekdays);
      setFieldValue("voice-rhythm-time", result.rhythmTimeWindow);
    });
  }, [profileBrief]);

  return (
    <form action={completeVoiceSetupAction} className="clin-card space-y-4 p-6">
      <h2 className="clin-section-title">Your voice &amp; rhythm</h2>
      <p className="text-sm text-[var(--clin-muted)]">
        Use AI to draft from your LinkedIn capture, refine each field, then finish.
      </p>

      <div className="rounded-lg border border-[var(--clin-border)] bg-[var(--clin-surface-muted)] p-3 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--clin-muted)]">
          Fill from profile
        </p>
        <label className="block text-xs text-[var(--clin-muted)]">
          Optional angle (e.g. &quot;thought leadership on AI compliance&quot;)
          <input
            type="text"
            value={profileBrief}
            onChange={(e) => setProfileBrief(e.target.value)}
            placeholder="Leave empty to infer from capture only"
            className="mt-1 w-full clin-input text-sm"
            disabled={pending}
          />
        </label>
        <button
          type="button"
          className="clin-btn-primary text-sm disabled:opacity-50"
          disabled={!profileReady || pending}
          title={
            profileReady
              ? undefined
              : "Link your profile and run extension Capture on step 2 first"
          }
          onClick={() => fillFromProfile()}
        >
          {pending ? "Generating…" : "Generate all fields from LinkedIn"}
        </button>
        {!profileReady ? (
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Go back to link your profile and capture it with the extension, or use
            the per-field assistants below.
          </p>
        ) : null}
        {profileError ? (
          <p className="text-xs text-red-700" role="alert">
            {profileError}
          </p>
        ) : null}
      </div>

      <label className="block text-sm">
        <span className="font-medium">Goals</span>
        <CopyFieldAssistant
          field="user_goals"
          textareaId="voice-goals-text"
          compact
        />
        <textarea
          id="voice-goals-text"
          name="goalsText"
          rows={4}
          defaultValue={goalsDefault}
          className="clin-input mt-1"
          required
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium">Positioning</span>
        <CopyFieldAssistant
          field="user_positioning"
          textareaId="voice-positioning-summary"
          contextFieldIds={["voice-goals-text"]}
          compact
        />
        <textarea
          id="voice-positioning-summary"
          name="positioningSummary"
          rows={4}
          defaultValue={positioningDefault}
          className="clin-input mt-1"
          required
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium">Content principles (optional)</span>
        <CopyFieldAssistant
          field="content_doctrine"
          textareaId="voice-content-doctrine"
          contextFieldIds={["voice-goals-text", "voice-positioning-summary"]}
          compact
        />
        <textarea
          id="voice-content-doctrine"
          name="contentDoctrine"
          rows={3}
          defaultValue={doctrineDefault}
          className="clin-input mt-1 text-sm"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium">Expertise one-liner (optional)</span>
        <CopyFieldAssistant
          field="expertise_summary"
          textareaId="voice-expertise-summary"
          contextFieldIds={["voice-goals-text", "voice-positioning-summary"]}
          compact
        />
        <input
          id="voice-expertise-summary"
          name="expertiseSummary"
          defaultValue={expertiseDefault}
          className="clin-input mt-1"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium">Default post language</span>
        <select
          name="contentLanguage"
          defaultValue={contentLanguageDefault}
          className="clin-input mt-1"
        >
          {CONTENT_LANGUAGE_PREFS.map((code) => (
            <option key={code} value={code}>
              {CONTENT_LANGUAGE_PREF_LABELS[code].label} — {CONTENT_LANGUAGE_PREF_LABELS[code].hint}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Publish days</span>
          <select
            id="voice-rhythm-weekdays"
            name="rhythmWeekdays"
            defaultValue={rhythmWeekdaysDefault}
            className="clin-input mt-1"
          >
            <option value="2,4">Tue &amp; Thu</option>
            <option value="1,3,5">Mon / Wed / Fri</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Time window</span>
          <input
            id="voice-rhythm-time"
            name="rhythmTimeWindow"
            defaultValue={rhythmTimeDefault}
            className="clin-input mt-1"
          />
        </label>
      </div>

      <div className="flex justify-between gap-2 pt-2">
        <button type="button" className="clin-btn-secondary" onClick={onBack}>
          Back
        </button>
        <button type="submit" className="clin-btn-primary">
          Finish — open Content plan
        </button>
      </div>
    </form>
  );
}
