/**
 * OVH AI Endpoints env — aligned with Nemrut `ovh-chat.ts` / `supabase/functions/.env`.
 */
import { resolveChatCompletionsUrl } from "@/lib/llm/adapters/openaiCompatible";
import { OVH_AI_DEFAULT_BASE_URL, OVH_AI_DEFAULT_MODEL } from "@/lib/llm/ovhDefaults";

export type OvhProcessEnv = {
  token?: string;
  chatUrl?: string;
  unifiedModelUrl?: string;
  legacyModelUrl?: string;
  orchestratorModel?: string;
  reasoningModel?: string;
  reasoningModelHigh?: string;
  chatModel?: string;
};

export function readOvhProcessEnv(
  env: NodeJS.ProcessEnv = process.env,
): OvhProcessEnv {
  const pick = (key: string) => {
    const v = env[key]?.trim();
    return v || undefined;
  };
  return {
    token: pick("OVH_AI_ENDPOINTS_ACCESS_TOKEN"),
    chatUrl: pick("OVH_AI_CHAT_URL"),
    unifiedModelUrl: pick("OVH_AI_UNIFIED_MODEL_URL"),
    legacyModelUrl: pick("OVH_AI_ENDPOINTS_MODEL_URL"),
    orchestratorModel: pick("OVH_AI_ORCHESTRATOR_MODEL"),
    reasoningModel:
      pick("OVH_AI_REASONING_MODEL") ?? pick("OVH_AI_REASONING_MODEL_HIGH"),
    reasoningModelHigh: pick("OVH_AI_REASONING_MODEL_HIGH"),
    chatModel: pick("OVH_AI_CHAT_MODEL"),
  };
}

/** API root stored in Clin settings (not the full /chat/completions URL). */
export function resolveOvhApiBaseFromEnv(ovh: OvhProcessEnv = readOvhProcessEnv()): string {
  if (ovh.chatUrl) {
    return ovh.chatUrl
      .replace(/\/chat\/completions\/?$/i, "")
      .replace(/\/$/, "");
  }
  const modelUrl = ovh.unifiedModelUrl ?? ovh.legacyModelUrl;
  if (modelUrl) {
    const raw = modelUrl.replace(/\/$/, "");
    if (/openai_compat\/.+\/chat\/completions|\/v1\/chat\/completions$/i.test(raw)) {
      return raw.replace(/\/chat\/completions\/?$/i, "");
    }
    if (/openai_compat|\/api\//i.test(raw)) {
      return raw;
    }
    return raw.endsWith("/v1") ? raw : `${raw}/v1`;
  }
  return OVH_AI_DEFAULT_BASE_URL;
}

/**
 * Chat completions URL — same resolution order as Nemrut `callOvhChat`.
 */
export function resolveOvhChatCompletionsUrl(opts?: {
  baseUrl?: string;
  env?: OvhProcessEnv;
}): string {
  if (opts?.baseUrl?.trim()) {
    return resolveChatCompletionsUrl(opts.baseUrl.trim());
  }

  const ovh = opts?.env ?? readOvhProcessEnv();
  const modelUrl = ovh.unifiedModelUrl ?? ovh.legacyModelUrl;

  if (ovh.chatUrl) {
    const u = ovh.chatUrl.trim();
    return u.endsWith("/chat/completions")
      ? u
      : `${u.replace(/\/$/, "")}/chat/completions`;
  }

  if (modelUrl) {
    const envModelUrlRaw = modelUrl.replace(/\/$/, "");
    const envLooksLikeChatEndpoint =
      /openai_compat\/.+\/chat\/completions|\/v1\/chat\/completions$/i.test(
        envModelUrlRaw,
      );
    if (envLooksLikeChatEndpoint) {
      return envModelUrlRaw;
    }
    const apiBase =
      envModelUrlRaw && !/openai_compat|\/api\//i.test(envModelUrlRaw)
        ? envModelUrlRaw.endsWith("/v1")
          ? envModelUrlRaw
          : `${envModelUrlRaw}/v1`
        : OVH_AI_DEFAULT_BASE_URL;
    return `${apiBase}/chat/completions`;
  }

  return `${OVH_AI_DEFAULT_BASE_URL}/chat/completions`;
}

/** Default fast model for Clin drafts / analysis (Nemrut orchestrator). */
export function resolveOvhDefaultModel(ovh: OvhProcessEnv = readOvhProcessEnv()): string {
  return (
    ovh.orchestratorModel ??
    ovh.chatModel ??
    OVH_AI_DEFAULT_MODEL
  );
}

export function resolveOvhReasoningModel(
  ovh: OvhProcessEnv = readOvhProcessEnv(),
): string | undefined {
  return ovh.reasoningModelHigh ?? ovh.reasoningModel;
}

/** Cloud credentials present in environment (`.env.local` at dev start). */
export function hasEnvCloudCredentials(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const ovh = readOvhProcessEnv(env);
  if (ovh.token) return true;
  const llm = env.LLM_API_KEY?.trim();
  if (llm) return true;
  const openai = env.OPENAI_API_KEY?.trim();
  return Boolean(openai);
}

export function hasEnvOllamaOverrides(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(
    env.OLLAMA_BASE_URL?.trim() || env.OLLAMA_MODEL?.trim(),
  );
}
