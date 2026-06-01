/** OVH AI Endpoints (OpenAI-compatible) — defaults aligned with Nemrut / EliaGo. */
export const OVH_AI_DEFAULT_BASE_URL =
  "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1";

/** Fast instruct model; good for Clin drafts and analysis. */
export const OVH_AI_DEFAULT_MODEL = "Mistral-Small-3.2-24B-Instruct-2506";

export const OVH_AI_SUGGESTED_MODELS = [
  OVH_AI_DEFAULT_MODEL,
  "gpt-oss-120b",
  "gpt-oss-20b",
  "Qwen2.5-72B-Instruct",
  "Llama-3.1-8B-Instruct",
] as const;
