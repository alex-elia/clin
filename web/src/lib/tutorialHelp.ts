/** Contextual tutorial steps (client-safe). */

export type TutorialStep = {
  id: string;
  target: string;
  title: string;
  body: string;
  placement?: "top" | "bottom";
};

export const BRANDING_POST_TOUR_ID = "branding-post-v1";

export const BRANDING_POST_TUTORIAL: TutorialStep[] = [
  {
    id: "autopilot",
    target: "autopilot",
    title: "Full autopilot",
    body: "Paste a voice note or brief, then run the pipeline. Same steps as Prepare, Writing assistant, Visual, and Preview — we may ask for more detail mid-run.",
    placement: "bottom",
  },
  {
    id: "prepare",
    target: "prepare",
    title: "Prepare",
    body: "Raw material lives here: quotes, context, angles. Tap Mic to dictate a voice note (Chrome / Edge). The more concrete your brief, the better the generated post.",
    placement: "bottom",
  },
  {
    id: "assistant",
    target: "assistant",
    title: "Manual assistant",
    body: "Prefer step-by-step? Chat here (Mic for voice instructions), then Apply to fill the form. Autopilot and assistant share the same coach.",
    placement: "top",
  },
  {
    id: "post",
    target: "post",
    title: "Post",
    body: "Title, format, language, schedule, hook, and body. Autopilot fills these; you edit before saving.",
    placement: "top",
  },
  {
    id: "visual",
    target: "visual",
    title: "Visual",
    body: "Pick photo or text graphic. Feed and carousel posts need an image before Mark ready. Download or send via the extension.",
    placement: "top",
  },
  {
    id: "preview",
    target: "preview",
    title: "Preview & handoff",
    body: "Live preview of hook, body, and LinkedIn paste format. Copy, then Mark ready, Mark published, or Archive — same actions whether you used autopilot or the assistant.",
    placement: "top",
  },
];

export function tutorialStorageKey(tourId: string): string {
  return `clin.tutorial.${tourId}.completed`;
}

export function readTutorialCompleted(tourId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(tutorialStorageKey(tourId)) === "1";
  } catch {
    return false;
  }
}

export function writeTutorialCompleted(tourId: string): void {
  try {
    localStorage.setItem(tutorialStorageKey(tourId), "1");
  } catch {
    /* ignore */
  }
}
