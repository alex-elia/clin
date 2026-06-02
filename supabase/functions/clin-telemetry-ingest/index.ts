import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const INGEST_SECRET = Deno.env.get("CLIN_TELEMETRY_INGEST_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const ALLOWED_ACTIONS = new Set([
  "capture_ingest",
  "campaign_autopilot",
  "editorial_tick",
  "contact_analyze",
  "campaign_prep_autopilot",
  "extension_outreach_draft",
  "brand_coach",
]);

const ALLOWED_FEATURES = new Set([
  "brand_coach",
  "copy_assistant",
  "post_image_prompt",
  "contact_analyze",
  "outreach_draft",
  "campaign_prep_plan",
  "campaign_prep_suggest",
  "campaign_icp_check",
  "voice_setup",
  "user_profile",
  "ingest_trends",
  "ingest_sources",
  "llm",
]);

const ALLOWED_SOURCES = new Set(["app", "llm"]);
const MAX_ERROR_LENGTH = 180;
const MAX_META_KEYS = 10;
const MAX_META_VALUE_LENGTH = 120;
const MAX_INSTANCE_ID_LENGTH = 64;
const MAX_EVENTS_PER_MINUTE = 100;
const MAX_EVENTS_PER_DAY = 50000;

// In-memory rate limit store (resets on cold start; good enough for abuse prevention)
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const dailyCount = { count: 0, resetAt: Date.now() + 86400000 };

function checkRateLimit(instanceId: string): boolean {
  const now = Date.now();
  
  // Daily global limit
  if (now > dailyCount.resetAt) {
    dailyCount.count = 0;
    dailyCount.resetAt = now + 86400000;
  }
  if (dailyCount.count >= MAX_EVENTS_PER_DAY) {
    return false;
  }
  dailyCount.count += 1;

  // Per-instance per-minute limit
  const key = instanceId;
  const limit = rateLimits.get(key);
  if (!limit || now > limit.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (limit.count >= MAX_EVENTS_PER_MINUTE) {
    return false;
  }
  limit.count += 1;
  return true;
}

function validatePayload(body: unknown): {
  valid: boolean;
  error?: string;
  row?: Record<string, unknown>;
} {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid JSON body" };
  }

  const event = body as Record<string, unknown>;

  // Required fields
  if (typeof event.id !== "string" || !/^[0-9a-f-]{36}$/.test(event.id)) {
    return { valid: false, error: "Invalid id (must be UUID)" };
  }
  if (
    typeof event.instance_id !== "string" ||
    event.instance_id.length > MAX_INSTANCE_ID_LENGTH
  ) {
    return { valid: false, error: "Invalid instance_id" };
  }
  if (typeof event.at !== "string") {
    return { valid: false, error: "Missing or invalid at (timestamp)" };
  }
  if (!ALLOWED_SOURCES.has(event.source as string)) {
    return { valid: false, error: "Invalid source (must be app or llm)" };
  }
  if (typeof event.ok !== "boolean") {
    return { valid: false, error: "Missing or invalid ok (boolean)" };
  }

  // Timestamp freshness (reject old events)
  const timestamp = new Date(event.at).getTime();
  const now = Date.now();
  if (isNaN(timestamp) || timestamp > now + 60000 || timestamp < now - 604800000) {
    return { valid: false, error: "Timestamp out of range (must be recent)" };
  }

  // Source-specific validation
  if (event.source === "app") {
    if (event.kind && !["feature", "orchestration"].includes(event.kind as string)) {
      return { valid: false, error: "Invalid kind for app source" };
    }
    if (event.action && !ALLOWED_ACTIONS.has(event.action as string)) {
      return { valid: false, error: "Unknown action" };
    }
  } else if (event.source === "llm") {
    if (event.feature && !ALLOWED_FEATURES.has(event.feature as string)) {
      return { valid: false, error: "Unknown feature" };
    }
  }

  // Optional numeric fields
  if (event.duration_ms != null) {
    const d = Number(event.duration_ms);
    if (!Number.isFinite(d) || d < 0 || d > 3600000) {
      return { valid: false, error: "Invalid duration_ms (0-3600000)" };
    }
  }
  if (event.input_tokens != null) {
    const t = Number(event.input_tokens);
    if (!Number.isFinite(t) || t < 0 || t > 1000000) {
      return { valid: false, error: "Invalid input_tokens" };
    }
  }
  if (event.output_tokens != null) {
    const t = Number(event.output_tokens);
    if (!Number.isFinite(t) || t < 0 || t > 1000000) {
      return { valid: false, error: "Invalid output_tokens" };
    }
  }
  if (event.total_tokens != null) {
    const t = Number(event.total_tokens);
    if (!Number.isFinite(t) || t < 0 || t > 2000000) {
      return { valid: false, error: "Invalid total_tokens" };
    }
  }
  if (event.estimated_cost_eur != null) {
    const c = Number(event.estimated_cost_eur);
    if (!Number.isFinite(c) || c < 0 || c > 100) {
      return { valid: false, error: "Invalid estimated_cost_eur" };
    }
  }

  // Error length
  if (event.error && typeof event.error === "string") {
    if (event.error.length > MAX_ERROR_LENGTH) {
      return { valid: false, error: "Error field too long" };
    }
  }

  // Meta validation
  if (event.meta) {
    if (typeof event.meta !== "object" || Array.isArray(event.meta)) {
      return { valid: false, error: "Invalid meta (must be object)" };
    }
    const metaKeys = Object.keys(event.meta as Record<string, unknown>);
    if (metaKeys.length > MAX_META_KEYS) {
      return { valid: false, error: "Too many meta keys" };
    }
    for (const [key, value] of Object.entries(event.meta as Record<string, unknown>)) {
      if (typeof value === "string" && value.length > MAX_META_VALUE_LENGTH) {
        return { valid: false, error: "Meta value too long" };
      }
    }
  }

  return { valid: true, row: event };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type, X-Clin-Telemetry-Secret",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check ingest secret
  const secret = req.headers.get("X-Clin-Telemetry-Secret");
  if (!INGEST_SECRET || secret !== INGEST_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const validation = validatePayload(body);
  if (!validation.valid) {
    return new Response(JSON.stringify({ error: validation.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const row = validation.row!;

  // Rate limiting
  if (!checkRateLimit(row.instance_id as string)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Insert to DB
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { error } = await supabase.from("clin_telemetry_events").insert(row);

  if (error) {
    // Duplicate key is fine (idempotent retries)
    if (error.code === "23505") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("Insert failed:", error);
    return new Response(JSON.stringify({ error: "Insert failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
