"use client";

import { PostWritingAssistant, type CoachChatMessage } from "@/components/PostWritingAssistant";

type PlanningChatPanelProps = {
  brandLanguage?: string | null;
  initialThreadId?: string | null;
  initialMessages?: CoachChatMessage[];
};

/** Studio / calendar planning — coach updates pipeline via API, not a post form. */
export function PlanningChatPanel({
  brandLanguage,
  initialThreadId,
  initialMessages,
}: PlanningChatPanelProps) {
  return (
    <PostWritingAssistant
      planningOnly
      brandLanguage={brandLanguage}
      initialThreadId={initialThreadId}
      initialMessages={initialMessages}
      onApplyPatch={() => {}}
    />
  );
}
