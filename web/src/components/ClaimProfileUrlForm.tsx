"use client";

import { useActionState } from "react";
import {
  claimSelfProfileFromUrl,
  type ClaimProfileState,
} from "@/app/actions";

export function ClaimProfileUrlForm() {
  const [state, formAction, pending] = useActionState<
    ClaimProfileState | null,
    FormData
  >(claimSelfProfileFromUrl, null);

  return (
    <form action={formAction} className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-clin-text">
          LinkedIn profile URL
        </span>
        <input
          name="profileUrl"
          type="url"
          required
          placeholder="https://www.linkedin.com/in/you"
          className="mt-1 clin-input"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="clin-btn-primary disabled:opacity-50"
      >
        {pending ? "Saving…" : "Add profile URL & link as me"}
      </button>
      {state?.ok === false ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}
      {state?.ok === true ? (
        <p className="text-sm leading-relaxed text-emerald-800 dark:text-emerald-200">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
