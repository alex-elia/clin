import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveDataDirectory } from "@/lib/dataPaths";

// Public ingest endpoint — centralized telemetry for all Clin users (opt-in).
// Placeholders until Supabase Edge Function is deployed; cloud push is skipped until configured.
// Ingest secret is rotatable; Edge Function provides abuse protection.
export const CENTRAL_INGEST_URL =
  "https://YOUR_PROJECT.supabase.co/functions/v1/clin-telemetry-ingest";
export const CENTRAL_INGEST_SECRET = "your-ingest-secret-here";

/** True when real ingest URL + secret are set (not shipped placeholders). */
export function isCentralIngestConfigured(
  ingestUrl: string,
  ingestSecret: string,
): boolean {
  if (!ingestUrl || !ingestSecret) return false;
  if (ingestUrl.includes("YOUR_PROJECT")) return false;
  if (ingestSecret === CENTRAL_INGEST_SECRET) return false;
  return ingestUrl.startsWith("https://") && ingestUrl.includes("/functions/v1/");
}

export type TelemetryCloudConfig = {
  enabled: boolean;
  ingestUrl: string;
  ingestSecret: string;
  instanceId: string;
};

const INSTANCE_FILE = "telemetry-instance-id.txt";

function isDisabledByEnv(): boolean {
  const raw = process.env.CLIN_TELEMETRY_ENABLED?.trim().toLowerCase();
  return raw === "0" || raw === "false" || raw === "no";
}

async function resolveInstanceId(): Promise<string> {
  const fromEnv = process.env.CLIN_TELEMETRY_INSTANCE_ID?.trim();
  if (fromEnv) return fromEnv.slice(0, 64);

  const filePath = path.join(resolveDataDirectory(), INSTANCE_FILE);
  try {
    const existing = (await fs.readFile(filePath, "utf8")).trim();
    if (existing) return existing;
  } catch {
    /* create below */
  }

  const id = randomUUID();
  const dir = resolveDataDirectory();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, `${id}\n`, "utf8");
  return id;
}

let cached: TelemetryCloudConfig | null | undefined;

/**
 * Server-only. Returns null when telemetry is disabled by user or env.
 * Uses central ingest endpoint by default; can be overridden with env vars for self-hosting.
 */
export async function getTelemetryCloudConfig(): Promise<TelemetryCloudConfig | null> {
  if (cached !== undefined) return cached;

  if (isDisabledByEnv()) {
    cached = null;
    return null;
  }

  // Check if user has consented (read from settings)
  const { getTelemetryConsent } = await import("@/lib/telemetrySettings");
  const consent = await getTelemetryConsent();
  if (!consent) {
    cached = null;
    return null;
  }

  // Allow self-hosting with custom endpoint
  const ingestUrl =
    process.env.CLIN_TELEMETRY_INGEST_URL?.trim() || CENTRAL_INGEST_URL;
  const ingestSecret =
    process.env.CLIN_TELEMETRY_INGEST_SECRET?.trim() || CENTRAL_INGEST_SECRET;

  if (!isCentralIngestConfigured(ingestUrl, ingestSecret)) {
    cached = null;
    return null;
  }

  cached = {
    enabled: true,
    ingestUrl,
    ingestSecret,
    instanceId: await resolveInstanceId(),
  };
  return cached;
}

export async function getTelemetryCloudStatus(): Promise<{
  consented: boolean;
  cloudConfigured: boolean;
  instanceId: string | null;
}> {
  const { getTelemetryConsent } = await import("@/lib/telemetrySettings");
  const consented = await getTelemetryConsent();

  const ingestUrl =
    process.env.CLIN_TELEMETRY_INGEST_URL?.trim() || CENTRAL_INGEST_URL;
  const ingestSecret =
    process.env.CLIN_TELEMETRY_INGEST_SECRET?.trim() || CENTRAL_INGEST_SECRET;
  const cloudConfigured = isCentralIngestConfigured(ingestUrl, ingestSecret);

  const cfg = await getTelemetryCloudConfig();
  if (!cfg) {
    return {
      consented,
      cloudConfigured,
      instanceId: consented ? await resolveInstanceId() : null,
    };
  }
  return {
    consented: true,
    cloudConfigured: true,
    instanceId: cfg.instanceId,
  };
}
