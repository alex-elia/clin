import { randomUUID } from "node:crypto";
import { appendAppEvent } from "@/lib/telemetry/appEventLog";

export type OrchestrationContext = {
  orchestrationId: string;
  /** Pass to completeChat meta to correlate LLM calls with a run. */
  llmMeta: Record<string, string | number | boolean | null>;
};

/**
 * Wrap a multi-step workflow; logs one orchestration event with duration and outcome.
 */
export async function runOrchestration<T>(opts: {
  action: string;
  meta?: Record<string, string | number | boolean | null>;
  fn: (ctx: OrchestrationContext) => Promise<T>;
}): Promise<{ result: T; orchestrationId: string }> {
  const orchestrationId = randomUUID();
  const ctx: OrchestrationContext = {
    orchestrationId,
    llmMeta: { orchestrationId, orchestration: opts.action },
  };
  const started = Date.now();
  try {
    const result = await opts.fn(ctx);
    await appendAppEvent({
      kind: "orchestration",
      action: opts.action,
      ok: true,
      durationMs: Date.now() - started,
      meta: { orchestrationId, ...opts.meta },
    });
    return { result, orchestrationId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await appendAppEvent({
      kind: "orchestration",
      action: opts.action,
      ok: false,
      durationMs: Date.now() - started,
      error: msg,
      meta: { orchestrationId, ...opts.meta },
    });
    throw e;
  }
}

/** Fire-and-forget single feature event (no throw on log failure). */
export function trackFeatureEvent(
  action: string,
  opts?: {
    ok?: boolean;
    durationMs?: number;
    error?: string;
    meta?: Record<string, string | number | boolean | null>;
  },
): void {
  void appendAppEvent({
    kind: "feature",
    action,
    ok: opts?.ok ?? true,
    durationMs: opts?.durationMs,
    error: opts?.error,
    meta: opts?.meta,
  }).catch(() => {
    /* telemetry must not break app flows */
  });
}

/**
 * Time a handler and log a feature event. Returns the handler result unchanged.
 */
export async function trackTimedFeature<T>(
  action: string,
  fn: () => Promise<T>,
  meta?: Record<string, string | number | boolean | null>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    trackFeatureEvent(action, {
      ok: true,
      durationMs: Date.now() - started,
      meta,
    });
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    trackFeatureEvent(action, {
      ok: false,
      durationMs: Date.now() - started,
      error: msg,
      meta,
    });
    throw e;
  }
}
