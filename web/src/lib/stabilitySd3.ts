/**
 * Stability AI official API — SD3 text2image (same contract as nemrut
 * supabase/functions/_shared/stability-sd3-text2image.ts).
 */

export const DEFAULT_STABILITY_SD3_URL =
  "https://api.stability.ai/v2beta/stable-image/generate/sd3";

export const DEFAULT_STABILITY_SD3_MODEL = "sd3.5-large";

const MAX_PROMPT = 2500;
const MAX_NEGATIVE = 1200;

export type StabilitySd3Result =
  | { ok: true; bytes: Buffer; mimeType: "image/jpeg" }
  | { ok: false; error: string; httpStatus?: number };

export function stabilitySd3UrlFromEnv(): string {
  return process.env.STABILITY_SD3_URL?.trim() || DEFAULT_STABILITY_SD3_URL;
}

export function stabilitySd3ModelFromEnv(): string {
  return process.env.STABILITY_SD3_MODEL?.trim() || DEFAULT_STABILITY_SD3_MODEL;
}

export function stabilityApiKeyFromEnv(): string | null {
  const k = process.env.STABILITY_API_KEY?.trim();
  return k || null;
}

export async function callStabilitySd3Text2Image(params: {
  prompt: string;
  negativePrompt?: string;
  apiKey: string;
  endpointUrl?: string;
  model?: string;
}): Promise<StabilitySd3Result> {
  const p = params.prompt.trim().slice(0, MAX_PROMPT);
  if (!p) return { ok: false, error: "Empty prompt." };
  const neg = params.negativePrompt?.trim().slice(0, MAX_NEGATIVE);
  const url = (params.endpointUrl ?? DEFAULT_STABILITY_SD3_URL).replace(
    /\/$/,
    "",
  );
  const model = (params.model ?? DEFAULT_STABILITY_SD3_MODEL).trim();

  const form = new FormData();
  form.set("prompt", p);
  form.set("output_format", "jpeg");
  if (model) form.set("model", model);
  if (neg) form.set("negative_prompt", neg);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "image/*",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: form,
      signal: AbortSignal.timeout(180_000),
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Stability API request failed.",
    };
  }

  if (!res.ok) {
    const t = (await res.text().catch(() => "")).slice(0, 500);
    return {
      ok: false,
      error: t || `Stability API HTTP ${res.status}`,
      httpStatus: res.status,
    };
  }

  const ab = await res.arrayBuffer();
  if (ab.byteLength === 0) {
    return { ok: false, error: "Stability API returned an empty image." };
  }

  return { ok: true, bytes: Buffer.from(ab), mimeType: "image/jpeg" };
}
