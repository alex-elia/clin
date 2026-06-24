"use client";

import { useEffect } from "react";
import {
  campaignMemberAnchorId,
  consumeCampaignExecScroll,
} from "@/lib/campaignExecScroll";

export function CampaignExecScrollRestore({
  campaignId,
  focusMemberId,
}: {
  campaignId: string;
  focusMemberId?: string | null;
}) {
  useEffect(() => {
    const run = () => {
      if (focusMemberId) {
        const el = document.getElementById(
          campaignMemberAnchorId(focusMemberId),
        );
        if (el) {
          el.scrollIntoView({ block: "center", behavior: "instant" });
          return;
        }
      }
      const y = consumeCampaignExecScroll(campaignId);
      if (y != null) window.scrollTo({ top: y, behavior: "instant" });
    };
    requestAnimationFrame(run);
  }, [campaignId, focusMemberId]);

  return null;
}
