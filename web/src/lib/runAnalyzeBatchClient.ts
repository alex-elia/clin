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
 * Calls analyze-batch in small chunks so the UI can show incremental progress.
 */
export async function runAnalyzeBatchChunked(opts: {
  totalLimit: number;
  chunkSize?: number;
  onProgress: (progress: AnalyzeBatchProgress) => void;
  signal?: AbortSignal;
}): Promise<AnalyzeBatchProgress & { results: BatchResult[] }> {
  const chunkSize = Math.min(10, Math.max(1, opts.chunkSize ?? 5));
  const target = Math.min(30, Math.max(1, Math.round(opts.totalLimit)));
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const allResults: BatchResult[] = [];

  const emit = () =>
    opts.onProgress({ target, processed, succeeded, failed });

  emit();

  while (processed < target) {
    if (opts.signal?.aborted) break;

    const limit = Math.min(chunkSize, target - processed);
    const res = await fetch("/api/autopilot/analyze-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit }),
      signal: opts.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data?.error === "string" ? data.error : `HTTP ${res.status}`,
      );
    }

    const results = (data.results ?? []) as BatchResult[];
    if (results.length === 0) break;

    allResults.push(...results);
    processed += results.length;
    succeeded += results.filter((r) => r.ok).length;
    failed += results.filter((r) => !r.ok).length;
    emit();
  }

  return { target, processed, succeeded, failed, results: allResults };
}
