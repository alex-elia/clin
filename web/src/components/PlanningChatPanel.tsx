"use client";

import { PostWritingAssistant } from "@/components/PostWritingAssistant";

type PlanningChatPanelProps = {
  brandLanguage?: string | null;
};

/** Studio / calendar planning — coach updates pipeline via API, not a post form. */
export function PlanningChatPanel({ brandLanguage }: PlanningChatPanelProps) {
  return (
    <PostWritingAssistant
      planningOnly
      brandLanguage={brandLanguage}
      onApplyPatch={() => {}}
    />
  );
}
