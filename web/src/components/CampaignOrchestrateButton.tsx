"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  orchestrateCampaignWorkflowAction,
  type OrchestrateCampaignWorkflowState,
} from "@/app/actions";

const initialState: OrchestrateCampaignWorkflowState = {
  ok: true,
  message: "",
  processed: 0,
  drafted: 0,
  skipped: 0,
  failed: 0,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <div className="space-y-1">
      <button
        type="submit"
        disabled={pending}
        className="clin-btn-secondary text-xs px-3 py-2 disabled:opacity-60"
      >
        {pending ? "Orchestrating campaign..." : "Orchestrate campaign now"}
      </button>
      <p
        aria-live="polite"
        className="text-[11px] text-clin-muted"
      >
        {pending
          ? "Running ICP + draft decisions on eligible members. This can take up to a few minutes..."
          : "Runs ICP checks and drafts for members that still need decisions."}
      </p>
    </div>
  );
}

export function CampaignOrchestrateButton({ campaignId }: { campaignId: string }) {
  const [state, formAction] = useActionState(
    orchestrateCampaignWorkflowAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="campaignId" value={campaignId} />
      <SubmitButton />
      {state.message ? (
        <p
          className={`text-xs ${state.ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

