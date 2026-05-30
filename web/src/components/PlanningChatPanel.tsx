"use client";

import { PostWritingAssistant } from "@/components/PostWritingAssistant";

/** Studio / calendar planning — coach updates pipeline via API, not a post form. */
export function PlanningChatPanel() {
  return <PostWritingAssistant planningOnly onApplyPatch={() => {}} />;
}
