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
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          LinkedIn profile URL
        </span>
        <input
          name="profileUrl"
          type="url"
          required
          placeholder="https://www.linkedin.com/in/you"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-600"
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
