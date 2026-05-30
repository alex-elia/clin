"use client";

/**
 * @deprecated Use PostWritingAssistant. Kept so stale webpack graphs / imports still resolve.
 */
import { PostWritingAssistant } from "@/components/PostWritingAssistant";
import type { PostFormPatch } from "@/components/ContentPostWorkspace";

type BrandCoachPanelProps = {
  postId?: string;
  compact?: boolean;
  onApplyPatch?: (patch: PostFormPatch) => void;
};

export function BrandCoachPanel({
  postId,
  compact: _compact,
  onApplyPatch = () => {},
}: BrandCoachPanelProps) {
  return (
    <PostWritingAssistant
      postId={postId}
      planningOnly={!postId}
      onApplyPatch={onApplyPatch}
    />
  );
}
