"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type QueueRow = {
  queue: {
    id: string;
    suggestedAction: string | null;
    priority: number;
  };
  contact: {
    id: string;
    fullName: string | null;
    linkedinUrlCanonical: string;
    segment: string;
  };
};

export function QueueActions({ items }: { items: QueueRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function patch(id: string, status: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">Queue is empty.</p>;
  }

  return (
    <ul className="space-y-4">
      {items.map(({ queue, contact }) => (
        <li
          key={queue.id}
          className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                {contact.fullName ?? "Unknown"}
              </p>
              <p className="text-xs text-zinc-500">{contact.segment}</p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                {queue.suggestedAction ?? "Review this contact."}
              </p>
              <a
                href={contact.linkedinUrlCanonical}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs text-blue-600 underline dark:text-blue-400"
              >
                Open LinkedIn profile (manual)
              </a>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy === queue.id}
                onClick={() => patch(queue.id, "reviewed")}
                className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Reviewed
              </button>
              <button
                type="button"
                disabled={busy === queue.id}
                onClick={() => patch(queue.id, "deferred")}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
              >
                Defer
              </button>
              <button
                type="button"
                disabled={busy === queue.id}
                onClick={() => patch(queue.id, "dismissed")}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-400"
              >
                Dismiss
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
