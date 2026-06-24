"use client";

import type { ReactNode } from "react";
import { preserveCampaignExecScroll } from "@/lib/campaignExecScroll";

type ServerAction = (formData: FormData) => void | Promise<void>;

export function CampaignScrollPreservingForm({
  campaignId,
  action,
  className,
  children,
}: {
  campaignId: string;
  action: ServerAction;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={() => preserveCampaignExecScroll(campaignId)}
    >
      {children}
    </form>
  );
}
