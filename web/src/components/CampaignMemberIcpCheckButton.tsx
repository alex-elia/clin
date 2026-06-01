"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  campaignId: string;
  memberId: string;
};

export function CampaignMemberIcpCheckButton({ campaignId, memberId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/members/${memberId}/icp-check`,
        { method: "POST" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Check failed.");
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        className="clin-btn-secondary text-xs px-2 py-1"
        disabled={busy}
        onClick={() => void runCheck()}
      >
        {busy ? "Checking…" : "Check ICP"}
      </button>
      {error ? (
        <span className="mt-0.5 text-[10px] text-red-600">{error}</span>
      ) : null}
    </span>
  );
}
