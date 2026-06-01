import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { hasOvhSdxlEnvConfig } from "@/lib/ovhSdxl";
import {
  DEFAULT_STABILITY_SD3_MODEL,
  DEFAULT_STABILITY_SD3_URL,
  stabilityApiKeyFromEnv,
  stabilitySd3ModelFromEnv,
  stabilitySd3UrlFromEnv,
} from "@/lib/stabilitySd3";

/**
 * Stability AI — env only (see web/.env.example). API key is never stored in SQLite.
 */
export const STABILITY_ENV = {
  apiKey: "STABILITY_API_KEY",
  sd3Url: "STABILITY_SD3_URL",
  sd3Model: "STABILITY_SD3_MODEL",
} as const;

/** User opt-out when env key is present (default: enabled if key exists). */
export const SD_KEYS = {
  userEnabled: "stability.user_enabled",
} as const;

/** @deprecated */
const LEGACY_ENABLED_KEY = "sd.enabled";

export type SdSettings = {
  enabled: boolean;
  apiUrl: string;
  model: string;
  apiKey: string | null;
};

export type SdSettingsPublic = {
  enabled: boolean;
  apiUrl: string;
  model: string;
  envConfigured: boolean;
  stabilityConfigured: boolean;
  ovhFallbackConfigured: boolean;
  envHint: string;
};

async function readSettingsMap(): Promise<Map<string, string>> {
  const db = getDb();
  const keys = [SD_KEYS.userEnabled, LEGACY_ENABLED_KEY];
  const rows = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, keys));
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.key, row.value);
  }
  return map;
}

/** Image gen is available when STABILITY_API_KEY is set in the environment. */
export function hasStabilityEnvConfig(): boolean {
  return Boolean(stabilityApiKeyFromEnv());
}

/** Stability and/or OVH SDXL (free fallback when Stability credits run out). */
export function hasImageGenEnvConfig(): boolean {
  return hasStabilityEnvConfig() || hasOvhSdxlEnvConfig();
}

function isUserEnabled(map: Map<string, string>): boolean {
  const user = map.get(SD_KEYS.userEnabled);
  if (user === "true") return true;
  if (user === "false") return false;
  if (map.get(LEGACY_ENABLED_KEY) === "false") return false;
  if (map.get(LEGACY_ENABLED_KEY) === "true") return true;
  return true;
}

function resolveSdConfig() {
  return {
    apiUrl: stabilitySd3UrlFromEnv(),
    model: stabilitySd3ModelFromEnv(),
    apiKey: stabilityApiKeyFromEnv(),
  };
}

export async function getSdSettings(): Promise<SdSettings> {
  const map = await readSettingsMap();
  const { apiUrl, model, apiKey } = resolveSdConfig();
  const envOk = hasImageGenEnvConfig();

  return {
    enabled: envOk && isUserEnabled(map),
    apiUrl,
    model,
    apiKey,
  };
}

export async function getSdSettingsPublic(): Promise<SdSettingsPublic> {
  const map = await readSettingsMap();
  const { apiUrl, model, apiKey } = resolveSdConfig();
  const stabilityConfigured = hasStabilityEnvConfig();
  const ovhFallbackConfigured = hasOvhSdxlEnvConfig();
  const envConfigured = stabilityConfigured || ovhFallbackConfigured;

  let envHint =
    "Add STABILITY_API_KEY and/or OVH_AI_ENDPOINTS_ACCESS_TOKEN to web/.env.local, then restart npm run dev.";
  if (stabilityConfigured && ovhFallbackConfigured) {
    envHint =
      "Stability SD3 is tried first; if credits run out, Clin uses OVH SDXL automatically (same as Nemrut).";
  } else if (ovhFallbackConfigured) {
    envHint = "Using OVH Stable Diffusion XL (no Stability key required).";
  }

  return {
    enabled: envConfigured && isUserEnabled(map),
    apiUrl,
    model,
    envConfigured,
    stabilityConfigured,
    ovhFallbackConfigured,
    envHint,
  };
}

async function upsertSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  const existing = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, key),
  });
  if (existing) {
    await db
      .update(appSettings)
      .set({ value, updatedAt: now })
      .where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value, updatedAt: now });
  }
}

export async function updateSdSettings(patch: {
  userEnabled?: boolean;
}): Promise<void> {
  if (patch.userEnabled !== undefined) {
    await upsertSetting(
      SD_KEYS.userEnabled,
      patch.userEnabled ? "true" : "false",
    );
  }
}
