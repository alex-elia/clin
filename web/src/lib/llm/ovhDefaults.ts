/** OVH AI Endpoints (OpenAI-compatible) — defaults aligned with Nemrut / EliaGo. */
export const OVH_AI_DEFAULT_BASE_URL =
  "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1";

/** Fast instruct model; good for Clin drafts and analysis. */
export const OVH_AI_DEFAULT_MODEL = "Mistral-Small-3.2-24B-Instruct-2506";

/** Visual / multimodal model for image prompt drafting (OVH Visual LLM). */
export const OVH_AI_DEFAULT_VISUAL_MODEL = "Qwen3.8-27B";

/** Reasoning model for long posts / structured coach actions (Nemrut REASONING). */
export const OVH_AI_DEFAULT_REASONING_MODEL = "gpt-oss-120b";

export const OVH_AI_SUGGESTED_MODELS = [
  OVH_AI_DEFAULT_MODEL,
  "Qwen3.8-27B",
  OVH_AI_DEFAULT_REASONING_MODEL,
  "gpt-oss-20b",
  "Qwen2.5-72B-Instruct",
  "Llama-3.1-8B-Instruct",
] as const;
