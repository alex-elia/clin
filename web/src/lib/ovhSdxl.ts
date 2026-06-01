/**
 * OVH AI Endpoints — Stable Diffusion XL text2image (free tier on OVH cloud).
 * Fallback when Stability AI credits are exhausted (same as Nemrut AI Audit).
 */

import { readOvhProcessEnv } from "@/lib/llm/ovhEnv";

export const DEFAULT_OVH_SDXL_TEXT2IMAGE_URL =
  "https://stable-diffusion-xl.endpoints.kepler.ai.cloud.ovh.net/api/text2image";

const MAX_PROMPT = 2500;
const MAX_NEGATIVE = 1200;

export type OvhSdxlResult =
  | { ok: true; bytes: Buffer; mimeType: "image/jpeg" }
  | { ok: false; error: string; httpStatus?: number };

export function ovhSdxlUrlFromEnv(): string {
  return (
    process.env.OVH_SDXL_TEXT2IMAGE_URL?.trim() || DEFAULT_OVH_SDXL_TEXT2IMAGE_URL
  );
}

export function ovhSdxlTokenFromEnv(): string | null {
  const ovh = readOvhProcessEnv();
  return ovh.token ?? process.env.LLM_API_KEY?.trim() ?? null;
}

export function hasOvhSdxlEnvConfig(): boolean {
  return Boolean(ovhSdxlTokenFromEnv());
}

export async function callOvhSdxlText2Image(params: {
  prompt: string;
  negativePrompt?: string;
  accessToken: string;
  endpointUrl?: string;
}): Promise<OvhSdxlResult> {
  const p = params.prompt.trim().slice(0, MAX_PROMPT);
  if (!p) return { ok: false, error: "Empty prompt." };
  const neg = params.negativePrompt?.trim().slice(0, MAX_NEGATIVE);
  const url = (params.endpointUrl ?? ovhSdxlUrlFromEnv()).replace(/\/$/, "");

  const payload: { prompt: string; negative_prompt?: string } = { prompt: p };
  if (neg) payload.negative_prompt = neg;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/octet-stream",
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180_000),
    });

    if (!res.ok) {
      const t = (await res.text().catch(() => "")).slice(0, 500);
      return {
        ok: false,
        error: t || `OVH SDXL HTTP ${res.status}`,
        httpStatus: res.status,
      };
    }

    const ab = await res.arrayBuffer();
    if (ab.byteLength === 0) {
      return { ok: false, error: "OVH SDXL returned an empty image." };
    }

    return { ok: true, bytes: Buffer.from(ab), mimeType: "image/jpeg" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "OVH SDXL request failed.",
    };
  }
}
