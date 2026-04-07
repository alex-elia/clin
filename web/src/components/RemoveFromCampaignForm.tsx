"use client";

import { removeMemberFromCampaignAction } from "@/app/actions";

export function RemoveFromCampaignForm({
  campaignId,
  memberId,
}: {
  campaignId: string;
  memberId: string;
}) {
  return (
    <form
      action={removeMemberFromCampaignAction}
      onSubmit={(e) => {
        if (
          !confirm(
            "Remove this person from this campaign only? They stay in Contacts.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="memberId" value={memberId} />
      <button
        type="submit"
        className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-800 hover:bg-red-50 dark:border-red-900 dark:bg-zinc-950 dark:text-red-200 dark:hover:bg-red-950/40"
      >
        Remove from campaign
      </button>
    </form>
  );
}
