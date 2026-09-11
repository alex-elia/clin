export type AnalyzeBatchProgress = {
  target: number;
  processed: number;
  succeeded: number;
  failed: number;
};

type BatchResult =
  | { contactId: string; ok: true; tier?: string }
  | { contactId: string; ok: false; error: string };

/**
 * Calls analyze-batch one contact at a time so the UI updates after each LLM run.
 */
export async function runAnalyzeBatchChunked(opts: {
  totalLimit: number;
  chunkSize?: number;
  onProgress: (progress: AnalyzeBatchProgress) => void;
  signal?: AbortSignal;
}): Promise<AnalyzeBatchProgress & { results: BatchResult[] }> {
  const chunkSize = Math.min(3, Math.max(1, opts.chunkSize ?? 1));
  const target = Math.min(30, Math.max(1, Math.round(opts.totalLimit)));
  let succeeded = 0;
  let failed = 0;
  const allResults: BatchResult[] = [];
  const excludeContactIds: string[] = [];

  const upsertResult = (r: BatchResult) => {
    const idx = allResults.findIndex((x) => x.contactId === r.contactId);
    if (idx === -1) {
      allResults.push(r);
      if (r.ok) succeeded += 1;
      else failed += 1;
      if (!excludeContactIds.includes(r.contactId)) {
        excludeContactIds.push(r.contactId);
      }
      return;
    }
    const prev = allResults[idx]!;
    if (r.ok && !prev.ok) {
      allResults[idx] = r;
      failed -= 1;
      succeeded += 1;
    }
  };

  const emit = () =>
    opts.onProgress({
      target,
      processed: allResults.length,
      succeeded,
      failed,
    });

  emit();

  while (allResults.length < target) {
    if (opts.signal?.aborted) break;

    const limit = Math.min(chunkSize, target - allResults.length);
    const res = await fetch("/api/autopilot/analyze-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit, excludeContactIds }),
      signal: opts.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data?.error === "string" ? data.error : `HTTP ${res.status}`,
      );
    }

    const results = (data.results ?? []) as BatchResult[];
    if (results.length === 0) {
      if (allResults.length === 0) {
        throw new Error(
          "No contacts were eligible for batch analyze. They may need name/headline on the contact row or in the profile capture JSON. Try Rescan, or run profile capture again.",
        );
      }
      break;
    }

    let added = 0;
    for (const r of results) {
      const before = allResults.length;
      upsertResult(r);
      if (allResults.length > before) added += 1;
    }

    if (added === 0) {
      // API returned only contacts we already tried.
      break;
    }

    emit();
  }

  return {
    target,
    processed: allResults.length,
    succeeded,
    failed,
    results: allResults,
  };
}
