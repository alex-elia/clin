"use client";

import { useCallback, useEffect, useState } from "react";
import {
  readTutorialCompleted,
  writeTutorialCompleted,
  type TutorialStep,
} from "@/lib/tutorialHelp";

type TutorialHelpLayerProps = {
  tourId: string;
  steps: TutorialStep[];
  children: React.ReactNode;
};

export function TutorialHelpLayer({
  tourId,
  steps,
  children,
}: TutorialHelpLayerProps) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(readTutorialCompleted(tourId));
    setMounted(true);
  }, [tourId]);

  const step = steps[index];

  const clearHighlight = useCallback(() => {
    document
      .querySelectorAll("[data-tour].clin-tour-highlight")
      .forEach((el) => el.classList.remove("clin-tour-highlight"));
  }, []);

  const applyHighlight = useCallback(
    (target: string) => {
      clearHighlight();
      const el = document.querySelector(`[data-tour="${target}"]`);
      el?.classList.add("clin-tour-highlight");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [clearHighlight],
  );

  useEffect(() => {
    if (!open || !step) {
      clearHighlight();
      return;
    }
    applyHighlight(step.target);
    return () => clearHighlight();
  }, [open, step, applyHighlight, clearHighlight]);

  const startTour = () => {
    setIndex(0);
    setOpen(true);
  };

  const finish = () => {
    setOpen(false);
    clearHighlight();
    writeTutorialCompleted(tourId);
    setDismissed(true);
  };

  const next = () => {
    if (index >= steps.length - 1) {
      finish();
      return;
    }
    setIndex((i) => i + 1);
  };

  const prev = () => setIndex((i) => Math.max(0, i - 1));

  return (
    <>
      {children}

      {open ? <div className="clin-tutorial-backdrop" aria-hidden /> : null}

      {open && step ? (
        <div
          className="clin-tutorial-panel bottom-24 right-4 p-4 sm:right-6"
          role="dialog"
          aria-labelledby="clin-tutorial-title"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--clin-accent)]">
            Step {index + 1} / {steps.length}
          </p>
          <h3 id="clin-tutorial-title" className="mt-1 text-base font-semibold text-[var(--clin-text)]">
            {step.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--clin-muted)]">{step.body}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="clin-btn-primary text-sm" onClick={next}>
              {index >= steps.length - 1 ? "Done" : "Next"}
            </button>
            {index > 0 ? (
              <button type="button" className="clin-btn-secondary text-sm" onClick={prev}>
                Back
              </button>
            ) : null}
            <button type="button" className="clin-link text-sm" onClick={finish}>
              Skip tour
            </button>
          </div>
        </div>
      ) : null}

      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        {mounted && !dismissed && !open ? (
          <button
            type="button"
            className="clin-btn-primary text-sm shadow-md"
            onClick={startTour}
          >
            Take the tour
          </button>
        ) : null}
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--clin-border)] bg-[var(--clin-surface)] text-lg font-semibold text-[var(--clin-accent)] shadow-md hover:bg-[var(--clin-primary-soft)]"
          title="Help tour"
          aria-label="Open help tour"
          onClick={() => (open ? finish() : startTour())}
        >
          ?
        </button>
      </div>
    </>
  );
}
