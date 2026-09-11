import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { hasEnvLocalFile } from "@/lib/llm/envFile";
import {
  hasEnvCloudCredentials,
  readOvhProcessEnv,
  resolveOvhApiBaseFromEnv,
  resolveOvhDefaultModel,
  resolveOvhReasoningModel,
} from "@/lib/llm/ovhEnv";
import { OVH_AI_DEFAULT_REASONING_MODEL, OVH_AI_DEFAULT_VISUAL_MODEL } from "@/lib/llm/ovhDefaults";
import type {
  LlmModelTier,
} from "@/lib/llm/llmModelRoute";
import { resolveTierModelId, routeClinFeature } from "@/lib/llm/llmModelRoute";
import type { LlmConfig, LlmProvider } from "@/lib/llm/types";

export type { LlmModelTier } from "@/lib/llm/llmModelRoute";

export { hasEnvCloudCredentials, hasEnvLocalFile };

const OVH_ENV = readOvhProcessEnv();

/** Per-provider storage — switching provider does not overwrite the other side. */
export const LLM_KEYS = {
  provider: "llm.provider",
  ollamaBaseUrl: "llm.ollama.base_url",
  ollamaModel: "llm.ollama.model",
  cloudBaseUrl: "llm.cloud.base_url",
  cloudModel: "llm.cloud.model",
  cloudReasoningModel: "llm.cloud.reasoning_model",
  cloudVisualModel: "llm.cloud.visual_model",
  apiKey: "llm.api_key",
} as const;

/** Legacy single-slot keys (migration only). */
const LEGACY_KEYS = {
  baseUrl: "llm.base_url",
  model: "llm.model",
  ollamaBaseUrl: "ollama.base_url",
  ollamaModel: "ollama.model",
} as const;

type ClinGlobal = typeof globalThis & {
  __CLIN_LLM_ENV_SEEDED__?: boolean;
  __CLIN_LLM_LEGACY_MIGRATED__?: boolean;
};
const g = globalThis as ClinGlobal;

function looksLikeOllamaBase(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u) return false;
  if (u.includes("11434")) return true;
  try {
    const parsed = new URL(u.startsWith("http") ? u : `http://${u}`);
    return (
      parsed.port === "11434" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost"
    );
  } catch {
    return u.includes("127.0.0.1") || u.includes("localhost");
  }
}

const ENV_PROVIDER = ((): LlmProvider | undefined => {
  const raw = process.env.LLM_PROVIDER?.trim();
  if (raw === "openai_compatible" || raw === "ollama") return raw;
  return undefined;
})();

const ENV_OLLAMA_BASE =
  typeof process.env.OLLAMA_BASE_URL === "string" &&
  process.env.OLLAMA_BASE_URL.trim()
    ? process.env.OLLAMA_BASE_URL.trim().replace(/\/$/, "")
    : "http://127.0.0.1:11434";

const ENV_CLOUD_BASE =
  typeof process.env.LLM_BASE_URL === "string" && process.env.LLM_BASE_URL.trim()
    ? process.env.LLM_BASE_URL.trim().replace(/\/$/, "")
    : resolveOvhApiBaseFromEnv(OVH_ENV);

const ENV_OLLAMA_MODEL =
  typeof process.env.OLLAMA_MODEL === "string" && process.env.OLLAMA_MODEL.trim()
    ? process.env.OLLAMA_MODEL.trim()
    : "qwen2.5:8b";

const ENV_CLOUD_MODEL =
  typeof process.env.LLM_MODEL === "string" && process.env.LLM_MODEL.trim()
    ? process.env.LLM_MODEL.trim()
    : resolveOvhDefaultModel(OVH_ENV);

const ENV_CLOUD_REASONING_MODEL =
  resolveOvhReasoningModel(OVH_ENV) ?? OVH_AI_DEFAULT_REASONING_MODEL;

const ENV_CLOUD_VISUAL_MODEL =
  typeof process.env.OVH_AI_VISUAL_MODEL === "string" &&
  process.env.OVH_AI_VISUAL_MODEL.trim()
    ? process.env.OVH_AI_VISUAL_MODEL.trim()
    : OVH_AI_DEFAULT_VISUAL_MODEL;

const ENV_API_KEY =
  typeof process.env.LLM_API_KEY === "string" && process.env.LLM_API_KEY.trim()
    ? process.env.LLM_API_KEY.trim()
    : OVH_ENV.token ||
      (typeof process.env.OPENAI_API_KEY === "string" &&
      process.env.OPENAI_API_KEY.trim()
        ? process.env.OPENAI_API_KEY.trim()
        : undefined);

export type LlmProviderProfile = {
  baseUrl: string;
  model: string;
  /** Cloud only — used when autoswitch picks reasoning tier. */
  reasoningModel?: string;
  /** Cloud only — visual LLM for image prompt drafting (e.g. Qwen3.8-27B). */
  visualModel?: string;
};

type ResolvedProfiles = {
  provider: LlmProvider;
  ollama: LlmProviderProfile;
  cloud: LlmProviderProfile;
  apiKey?: string;
};

function parseProvider(raw: string | undefined): LlmProvider {
  if (raw === "openai_compatible") return "openai_compatible";
  return "ollama";
}

function resolveProfilesFromMap(map: Map<string, string>): ResolvedProfiles {
  const provider = parseProvider(map.get(LLM_KEYS.provider)?.trim());
  const legacyBase =
    map.get(LEGACY_KEYS.baseUrl)?.trim() ||
    map.get(LEGACY_KEYS.ollamaBaseUrl)?.trim();
  const legacyModel =
    map.get(LEGACY_KEYS.model)?.trim() ||
    map.get(LEGACY_KEYS.ollamaModel)?.trim();

  const legacyIsOllama = legacyBase ? looksLikeOllamaBase(legacyBase) : false;

  const ollamaBase =
    map.get(LLM_KEYS.ollamaBaseUrl)?.trim() ||
    (legacyBase && legacyIsOllama ? legacyBase : undefined) ||
    ENV_OLLAMA_BASE;
  const ollamaModel =
    map.get(LLM_KEYS.ollamaModel)?.trim() ||
    (legacyModel && legacyIsOllama ? legacyModel : undefined) ||
    ENV_OLLAMA_MODEL;

  const cloudBase =
    map.get(LLM_KEYS.cloudBaseUrl)?.trim() ||
    (legacyBase && !legacyIsOllama ? legacyBase : undefined) ||
    ENV_CLOUD_BASE;
  const cloudModel =
    map.get(LLM_KEYS.cloudModel)?.trim() ||
    (legacyModel && !legacyIsOllama ? legacyModel : undefined) ||
    ENV_CLOUD_MODEL;
  const cloudReasoningModel =
    map.get(LLM_KEYS.cloudReasoningModel)?.trim() ||
    ENV_CLOUD_REASONING_MODEL;
  const cloudVisualModel =
    map.get(LLM_KEYS.cloudVisualModel)?.trim() || ENV_CLOUD_VISUAL_MODEL;

  const apiKey = map.get(LLM_KEYS.apiKey)?.trim() || undefined;

  return {
    provider,
    ollama: {
      baseUrl: ollamaBase.replace(/\/$/, ""),
      model: ollamaModel,
    },
    cloud: {
      baseUrl: cloudBase.replace(/\/$/, ""),
      model: cloudModel,
      reasoningModel: cloudReasoningModel,
      visualModel: cloudVisualModel,
    },
    apiKey: apiKey || undefined,
  };
}

function activeConfig(profiles: ResolvedProfiles): LlmConfig {
  const slot = profiles.provider === "openai_compatible" ? profiles.cloud : profiles.ollama;
  return {
    provider: profiles.provider,
    baseUrl: slot.baseUrl,
    model: slot.model,
    apiKey: profiles.provider === "openai_compatible" ? profiles.apiKey : undefined,
  };
}

async function loadSettingsMap(): Promise<Map<string, string>> {
  const db = getDb();
  const keys = [
    ...Object.values(LLM_KEYS),
    ...Object.values(LEGACY_KEYS),
  ];
  const rows = await db.query.appSettings.findMany({
    where: inArray(appSettings.key, keys),
  });
  return new Map(rows.map((r) => [r.key, r.value]));
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

async function deleteSetting(key: string): Promise<void> {
  const db = getDb();
  await db.delete(appSettings).where(eq(appSettings.key, key));
}

async function deleteLegacyLlmKeys(): Promise<void> {
  for (const key of Object.values(LEGACY_KEYS)) {
    await deleteSetting(key);
  }
}

/**
 * One-time split of single-slot `llm.base_url` into per-provider keys so Ollama
 * edits no longer bleed into the cloud field (and vice versa).
 */
export async function migrateLegacyLlmSettingsIfNeeded(): Promise<void> {
  if (g.__CLIN_LLM_LEGACY_MIGRATED__) return;
  g.__CLIN_LLM_LEGACY_MIGRATED__ = true;

  const map = await loadSettingsMap();
  const legacyBase =
    map.get(LEGACY_KEYS.baseUrl)?.trim() ||
    map.get(LEGACY_KEYS.ollamaBaseUrl)?.trim();
  const legacyModel =
    map.get(LEGACY_KEYS.model)?.trim() ||
    map.get(LEGACY_KEYS.ollamaModel)?.trim();

  const hasSplit =
    Boolean(map.get(LLM_KEYS.ollamaBaseUrl)?.trim()) &&
    Boolean(map.get(LLM_KEYS.cloudBaseUrl)?.trim());

  if (!legacyBase && !legacyModel && hasSplit) {
    await deleteLegacyLlmKeys();
    return;
  }

  if (!legacyBase && !legacyModel) return;

  const provider = parseProvider(map.get(LLM_KEYS.provider)?.trim());
  const legacyIsOllama = legacyBase ? looksLikeOllamaBase(legacyBase) : false;

  const ollamaBase =
    map.get(LLM_KEYS.ollamaBaseUrl)?.trim() ||
    (legacyBase && legacyIsOllama ? legacyBase : undefined) ||
    ENV_OLLAMA_BASE;
  const ollamaModel =
    map.get(LLM_KEYS.ollamaModel)?.trim() ||
    (legacyModel && legacyIsOllama ? legacyModel : undefined) ||
    ENV_OLLAMA_MODEL;

  const cloudBase =
    map.get(LLM_KEYS.cloudBaseUrl)?.trim() ||
    (legacyBase && !legacyIsOllama ? legacyBase : undefined) ||
    ENV_CLOUD_BASE;
  const cloudModel =
    map.get(LLM_KEYS.cloudModel)?.trim() ||
    (legacyModel && !legacyIsOllama ? legacyModel : undefined) ||
    ENV_CLOUD_MODEL;

  await upsertSetting(LLM_KEYS.ollamaBaseUrl, ollamaBase.replace(/\/$/, ""));
  await upsertSetting(LLM_KEYS.ollamaModel, ollamaModel);
  await upsertSetting(LLM_KEYS.cloudBaseUrl, cloudBase.replace(/\/$/, ""));
  await upsertSetting(LLM_KEYS.cloudModel, cloudModel);
  if (!map.get(LLM_KEYS.cloudReasoningModel)?.trim()) {
    await upsertSetting(
      LLM_KEYS.cloudReasoningModel,
      ENV_CLOUD_REASONING_MODEL,
    );
  }
  if (!map.get(LLM_KEYS.cloudVisualModel)?.trim()) {
    await upsertSetting(LLM_KEYS.cloudVisualModel, ENV_CLOUD_VISUAL_MODEL);
  }
  if (!map.get(LLM_KEYS.provider)?.trim()) {
    await upsertSetting(LLM_KEYS.provider, provider);
  }
  await deleteLegacyLlmKeys();
}

/** Seed missing provider profiles from `.env.local` (does not overwrite saved DB values). */
export async function seedLlmSettingsFromEnvOnce(): Promise<void> {
  if (g.__CLIN_LLM_ENV_SEEDED__) return;
  g.__CLIN_LLM_ENV_SEEDED__ = true;

  await migrateLegacyLlmSettingsIfNeeded();

  const mapBeforeEnv = await loadSettingsMap();
  if (!mapBeforeEnv.get(LLM_KEYS.cloudReasoningModel)?.trim()) {
    await upsertSetting(
      LLM_KEYS.cloudReasoningModel,
      ENV_CLOUD_REASONING_MODEL,
    );
  }
  if (!mapBeforeEnv.get(LLM_KEYS.cloudVisualModel)?.trim()) {
    await upsertSetting(LLM_KEYS.cloudVisualModel, ENV_CLOUD_VISUAL_MODEL);
  }

  if (!hasEnvLocalFile()) return;

  const map = await loadSettingsMap();
  const seedIfMissing = async (key: string, value: string) => {
    if (!map.get(key)?.trim()) {
      await upsertSetting(key, value);
      map.set(key, value);
    }
  };

  const provider: LlmProvider =
    map.get(LLM_KEYS.provider)?.trim()
      ? parseProvider(map.get(LLM_KEYS.provider))
      : (ENV_PROVIDER ??
        (hasEnvCloudCredentials() ? "openai_compatible" : "ollama"));

  await seedIfMissing(LLM_KEYS.provider, provider);
  await seedIfMissing(
    LLM_KEYS.ollamaBaseUrl,
    ENV_OLLAMA_BASE.replace(/\/$/, ""),
  );
  await seedIfMissing(LLM_KEYS.ollamaModel, ENV_OLLAMA_MODEL);
  await seedIfMissing(
    LLM_KEYS.cloudBaseUrl,
    ENV_CLOUD_BASE.replace(/\/$/, ""),
  );
  await seedIfMissing(LLM_KEYS.cloudModel, ENV_CLOUD_MODEL);
  await seedIfMissing(
    LLM_KEYS.cloudReasoningModel,
    ENV_CLOUD_REASONING_MODEL,
  );
  await seedIfMissing(LLM_KEYS.cloudVisualModel, ENV_CLOUD_VISUAL_MODEL);
  if (ENV_API_KEY && !map.get(LLM_KEYS.apiKey)?.trim()) {
    await upsertSetting(LLM_KEYS.apiKey, ENV_API_KEY);
  }
}

async function loadProfilesFromDb(): Promise<ResolvedProfiles> {
  const map = await loadSettingsMap();
  return resolveProfilesFromMap(map);
}

export type LlmConfigPublic = {
  provider: LlmProvider;
  ollama: LlmProviderProfile;
  cloud: LlmProviderProfile;
  apiKeySet: boolean;
  prefilledFromEnvLocal: boolean;
};

export async function getLlmConfig(): Promise<LlmConfig> {
  await seedLlmSettingsFromEnvOnce();
  return activeConfig(await loadProfilesFromDb());
}

/** Apply orchestrator vs reasoning tier on cloud; Ollama keeps the configured model. */
export async function getLlmConfigForTier(
  tier: LlmModelTier,
): Promise<{ config: LlmConfig; modelTier: LlmModelTier; autoswitched: boolean }> {
  await seedLlmSettingsFromEnvOnce();
  const profiles = await loadProfilesFromDb();
  const base = activeConfig(profiles);
  if (base.provider !== "openai_compatible") {
    return { config: base, modelTier: "orchestrator", autoswitched: false };
  }
  const picked = resolveTierModelId(
    profiles.cloud.model,
    profiles.cloud.reasoningModel,
    tier,
    profiles.cloud.visualModel,
    ENV_CLOUD_MODEL,
  );
  return {
    config: { ...base, model: picked.model },
    modelTier: picked.tier,
    autoswitched: picked.autoswitched,
  };
}

export async function getLlmConfigForFeature(
  feature: string,
  opts?: { kind?: string; userChars?: number },
): Promise<{
  config: LlmConfig;
  modelTier: LlmModelTier;
  autoswitched: boolean;
  reason: string;
}> {
  const route = routeClinFeature(feature, opts);
  const resolved = await getLlmConfigForTier(route.tier);
  return { ...resolved, reason: route.reason };
}

/** Visual LLM for post image prompt drafting (cloud only). Falls back to orchestrator on Ollama. */
export async function getLlmConfigForVisual(): Promise<LlmConfig> {
  const resolved = await getLlmConfigForTier("visual");
  return resolved.config;
}

export async function getLlmConfigPublic(): Promise<LlmConfigPublic> {
  await seedLlmSettingsFromEnvOnce();
  const map = await loadSettingsMap();
  const p = resolveProfilesFromMap(map);
  return {
    provider: p.provider,
    ollama: p.ollama,
    cloud: p.cloud,
    apiKeySet: Boolean(p.apiKey?.trim() || map.get(LLM_KEYS.apiKey)?.trim()),
    prefilledFromEnvLocal: Boolean(hasEnvLocalFile() && g.__CLIN_LLM_ENV_SEEDED__),
  };
}

export type LlmConfigPatch = Partial<{
  provider: LlmProvider;
  ollamaBaseUrl: string;
  ollamaModel: string;
  cloudBaseUrl: string;
  cloudModel: string;
  cloudReasoningModel: string;
  cloudVisualModel: string;
  apiKey: string | null;
}>;

export async function updateLlmConfig(
  patch: LlmConfigPatch,
): Promise<LlmConfig> {
  await seedLlmSettingsFromEnvOnce();
  const current = await loadProfilesFromDb();

  const provider = patch.provider ?? current.provider;

  const ollamaBaseUrl =
    typeof patch.ollamaBaseUrl === "string" && patch.ollamaBaseUrl.trim()
      ? patch.ollamaBaseUrl.trim().replace(/\/$/, "")
      : current.ollama.baseUrl;
  const ollamaModel =
    typeof patch.ollamaModel === "string" && patch.ollamaModel.trim()
      ? patch.ollamaModel.trim()
      : current.ollama.model;

  const cloudBaseUrl =
    typeof patch.cloudBaseUrl === "string" && patch.cloudBaseUrl.trim()
      ? patch.cloudBaseUrl.trim().replace(/\/$/, "")
      : current.cloud.baseUrl;
  const cloudModel =
    typeof patch.cloudModel === "string" && patch.cloudModel.trim()
      ? patch.cloudModel.trim()
      : current.cloud.model;
  const cloudReasoningModel =
    typeof patch.cloudReasoningModel === "string" &&
    patch.cloudReasoningModel.trim()
      ? patch.cloudReasoningModel.trim()
      : current.cloud.reasoningModel ?? ENV_CLOUD_REASONING_MODEL;
  const cloudVisualModel =
    typeof patch.cloudVisualModel === "string" && patch.cloudVisualModel.trim()
      ? patch.cloudVisualModel.trim()
      : current.cloud.visualModel ?? ENV_CLOUD_VISUAL_MODEL;

  let apiKey = current.apiKey;
  if (patch.apiKey === null) {
    apiKey = undefined;
  } else if (typeof patch.apiKey === "string" && patch.apiKey.trim()) {
    apiKey = patch.apiKey.trim();
  }

  await upsertSetting(LLM_KEYS.provider, provider);
  await upsertSetting(LLM_KEYS.ollamaBaseUrl, ollamaBaseUrl);
  await upsertSetting(LLM_KEYS.ollamaModel, ollamaModel);
  await upsertSetting(LLM_KEYS.cloudBaseUrl, cloudBaseUrl);
  await upsertSetting(LLM_KEYS.cloudModel, cloudModel);
  await upsertSetting(LLM_KEYS.cloudReasoningModel, cloudReasoningModel);
  await upsertSetting(LLM_KEYS.cloudVisualModel, cloudVisualModel);

  if (apiKey) {
    await upsertSetting(LLM_KEYS.apiKey, apiKey);
  } else if (patch.apiKey === null) {
    await deleteSetting(LLM_KEYS.apiKey);
  }

  await deleteLegacyLlmKeys();

  return getLlmConfig();
}

export async function probeLlmConnection(
  config?: LlmConfig,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = config ?? (await getLlmConfig());
  if (c.provider === "ollama") {
    return listOllamaModels(c.baseUrl).then((r) =>
      r.ok ? { ok: true as const } : { ok: false as const, error: r.error },
    );
  }
  if (!c.apiKey?.trim()) {
    return { ok: false, error: "API key is required for cloud inference." };
  }
  const { resolveOvhChatCompletionsUrl } = await import("@/lib/llm/ovhEnv");
  const url = resolveOvhChatCompletionsUrl({ baseUrl: c.baseUrl });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: c.model,
        messages: [{ role: "user", content: "Reply with exactly: ok" }],
        max_tokens: 16,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `HTTP ${res.status}: ${text.slice(0, 300)}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function listOllamaModels(
  baseUrl: string,
): Promise<
  { ok: true; models: string[] } | { ok: false; error: string }
> {
  const root = baseUrl.replace(/\/$/, "");
  try {
    const res = await fetch(`${root}/api/tags`, { cache: "no-store" });
    if (!res.ok) {
      return {
        ok: false,
        error: `GET /api/tags → HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as { models?: { name?: string }[] };
    const models = (data.models ?? [])
      .map((m) => m.name?.trim())
      .filter((n): n is string => Boolean(n));
    return { ok: true, models };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
