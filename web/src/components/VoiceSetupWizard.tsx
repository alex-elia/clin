"use client";

import { useState } from "react";
import { saveUserContextContactOnly } from "@/app/actions";
import { ClaimProfileUrlForm } from "@/components/ClaimProfileUrlForm";
import { VoiceSetupVoiceFields } from "@/components/VoiceSetupVoiceFields";

type ContactOption = { id: string; label: string };

type VoiceSetupWizardProps = {
  contacts: ContactOption[];
  selfContactId: string | null;
  goalsDefault: string;
  positioningDefault: string;
  doctrineDefault: string;
  expertiseDefault: string;
  rhythmWeekdaysDefault: string;
  rhythmTimeDefault: string;
  contentLanguageDefault: string;
  profileReady: boolean;
};

const STEPS = ["Welcome", "Profile", "Your voice", "Done"] as const;

export function VoiceSetupWizard({
  contacts,
  selfContactId,
  goalsDefault,
  positioningDefault,
  doctrineDefault,
  expertiseDefault,
  rhythmWeekdaysDefault,
  rhythmTimeDefault,
  contentLanguageDefault,
  profileReady,
}: VoiceSetupWizardProps) {
  const [step, setStep] = useState(0);

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
          Setup · {step + 1} / {STEPS.length}
        </p>
        <h1 className="clin-page-title mt-1">Your voice on LinkedIn</h1>
        <p className="clin-page-lead">
          Tutorial before you write posts — about 5 minutes.
        </p>
      </div>

      <div className="flex gap-1">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`h-1 flex-1 rounded-full ${
              i <= step ? "bg-[var(--clin-accent)]" : "bg-[var(--clin-border)]"
            }`}
            title={label}
          />
        ))}
      </div>

      {step === 0 ? (
        <section className="clin-card space-y-4 p-6">
          <h2 className="clin-section-title">What Clin needs</h2>
          <ul className="list-inside list-disc space-y-2 text-sm text-[var(--clin-muted)]">
            <li>Your LinkedIn profile (extension capture)</li>
            <li>Goals and positioning for the writing assistant</li>
            <li>Optional publish rhythm (e.g. Tue/Thu morning)</li>
          </ul>
          <p className="text-sm">
            Then: <strong>Content plan</strong> → one <strong>Writing assistant</strong> at the top
            of each post to draft hook, body, title, and schedule.
          </p>
          <button type="button" className="clin-btn-primary" onClick={() => setStep(1)}>
            Start
          </button>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="clin-card space-y-4 p-6">
          <h2 className="clin-section-title">Link your profile</h2>
          <p className="text-sm text-[var(--clin-muted)]">
            Paste your /in/… URL or pick a contact, then run Capture in the extension.
          </p>
          <ClaimProfileUrlForm />
          <form
            action={saveUserContextContactOnly}
            className="space-y-3 border-t border-[var(--clin-border)] pt-4"
          >
            <select
              name="selfContactId"
              defaultValue={selfContactId ?? ""}
              className="clin-input"
            >
              <option value="">— Pick contact —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button type="submit" className="clin-btn-secondary w-full">
              Save profile contact
            </button>
          </form>
          <div className="flex justify-between gap-2">
            <button type="button" className="clin-btn-secondary" onClick={() => setStep(0)}>
              Back
            </button>
            <button type="button" className="clin-btn-primary" onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <VoiceSetupVoiceFields
          goalsDefault={goalsDefault}
          positioningDefault={positioningDefault}
          doctrineDefault={doctrineDefault}
          expertiseDefault={expertiseDefault}
          rhythmWeekdaysDefault={rhythmWeekdaysDefault}
          rhythmTimeDefault={rhythmTimeDefault}
          contentLanguageDefault={contentLanguageDefault}
          profileReady={profileReady}
          onBack={() => setStep(1)}
        />
      ) : null}
    </div>
  );
}
