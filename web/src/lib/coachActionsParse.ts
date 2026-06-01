import {
  coachActionSchema,
  coachActionsEnvelopeSchema,
  type CoachAction,
} from "@/lib/brandCoachTypes";
import type { CoachActionsParseDebug } from "@/lib/coachDebug";

export const COACH_ACTIONS_MARKER = "```coach-actions";

/** Normalize model date strings before Zod (avoids rejecting `2024-06-04T08:45`). */
export function normalizeCoachScheduledAt(
  raw: unknown,
): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const withSeconds =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? `${s}:00` : s;
  const d = new Date(withSeconds);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeActionPatch(patch: unknown): unknown {
  if (!patch || typeof patch !== "object") return patch;
  const p = { ...(patch as Record<string, unknown>) };
  if ("scheduledAt" in p) {
    p.scheduledAt = normalizeCoachScheduledAt(p.scheduledAt);
  }
  if (typeof p.body === "string") {
    p.body = p.body.replace(/\\n/g, "\n");
  }
  if (typeof p.hook === "string") {
    p.hook = p.hook.replace(/\\n/g, "\n");
  }
  return p;
}

export function normalizeCoachActionsPayload(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object") return parsed;
  const obj = parsed as { actions?: unknown };
  if (!Array.isArray(obj.actions)) return parsed;
  return {
    ...obj,
    actions: obj.actions.map((action) => {
      if (!action || typeof action !== "object") return action;
      const a = action as Record<string, unknown>;
      if (a.type === "update_post" && a.patch) {
        return { ...a, patch: normalizeActionPatch(a.patch) };
      }
      if (a.type === "create_post" && a.post && typeof a.post === "object") {
        const post = { ...(a.post as Record<string, unknown>) };
        if ("scheduledAt" in post) {
          post.scheduledAt = normalizeCoachScheduledAt(post.scheduledAt);
        }
        return { ...a, post };
      }
      if (a.type === "reschedule_pipeline" && Array.isArray(a.items)) {
        return {
          ...a,
          items: a.items.map((item) => {
            if (!item || typeof item !== "object") return item;
            const it = { ...(item as Record<string, unknown>) };
            if ("scheduledAt" in it) {
              it.scheduledAt = normalizeCoachScheduledAt(it.scheduledAt);
            }
            return it;
          }),
        };
      }
      return a;
    }),
  };
}

/** Extract JSON object from text after the coach-actions marker (balanced braces). */
export function extractCoachActionsJson(afterMarker: string): string | null {
  let block = afterMarker.trim();
  if (block.startsWith("```")) {
    block = block.replace(/^```[\w-]*\n?/, "").replace(/\n?```\s*$/u, "").trim();
  }
  const start = block.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < block.length; i += 1) {
    const ch = block[i]!;
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return block.slice(start, i + 1);
    }
  }
  return null;
}

function salvageActions(parsed: unknown): CoachAction[] {
  if (!parsed || typeof parsed !== "object") return [];
  const actions = (parsed as { actions?: unknown }).actions;
  if (!Array.isArray(actions)) return [];
  const out: CoachAction[] = [];
  for (const raw of actions) {
    const normalized = normalizeCoachActionsPayload({ actions: [raw] }) as {
      actions: unknown[];
    };
    const one = coachActionSchema.safeParse(normalized.actions[0]);
    if (one.success) out.push(one.data);
  }
  return out;
}

export function parseCoachActionsFromLlm(text: string): {
  reply: string;
  actions: CoachAction[];
  parse: CoachActionsParseDebug;
} {
  const rawLength = text.length;
  const rawTailPreview = text.slice(-2000);
  const baseParse: CoachActionsParseDebug = {
    hasCoachActionsBlock: false,
    jsonExtracted: false,
    schemaValid: false,
    schemaError: null,
    actionsCount: 0,
    rawLength,
    rawTailPreview,
  };

  const idx = text.lastIndexOf(COACH_ACTIONS_MARKER);
  if (idx === -1) {
    return { reply: text.trim(), actions: [], parse: baseParse };
  }

  const reply = text.slice(0, idx).trim();
  const rest = text.slice(idx + COACH_ACTIONS_MARKER.length);
  const jsonText = extractCoachActionsJson(rest);

  if (!jsonText) {
    return {
      reply,
      actions: [],
      parse: { ...baseParse, hasCoachActionsBlock: true },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return {
      reply,
      actions: [],
      parse: {
        ...baseParse,
        hasCoachActionsBlock: true,
        schemaError: e instanceof Error ? e.message : "JSON parse error",
      },
    };
  }

  const normalized = normalizeCoachActionsPayload(parsed);
  const env = coachActionsEnvelopeSchema.safeParse(normalized);

  if (env.success) {
    return {
      reply,
      actions: env.data.actions,
      parse: {
        ...baseParse,
        hasCoachActionsBlock: true,
        jsonExtracted: true,
        schemaValid: true,
        actionsCount: env.data.actions.length,
      },
    };
  }

  const salvaged = salvageActions(normalized);
  const schemaError =
    env.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") ||
    "Invalid actions schema";

  if (salvaged.length > 0) {
    return {
      reply,
      actions: salvaged,
      parse: {
        ...baseParse,
        hasCoachActionsBlock: true,
        jsonExtracted: true,
        schemaValid: false,
        schemaError: `Partial apply (${schemaError})`,
        actionsCount: salvaged.length,
      },
    };
  }

  return {
    reply,
    actions: [],
    parse: {
      ...baseParse,
      hasCoachActionsBlock: true,
      jsonExtracted: true,
      schemaError,
    },
  };
}
