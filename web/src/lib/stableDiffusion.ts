import fs from "node:fs/promises";
import path from "node:path";
import {
  formatImageProviderLabel,
  stabilityErrorImpliesOvhFallback,
  type ImageGenerationProvider,
} from "@/lib/imageGeneration";
import { callOvhSdxlText2Image, hasOvhSdxlEnvConfig, ovhSdxlTokenFromEnv, ovhSdxlUrlFromEnv } from "@/lib/ovhSdxl";
import { getSdSettings, hasImageGenEnvConfig } from "@/lib/sdSettings";
import { callStabilitySd3Text2Image } from "@/lib/stabilitySd3";
import { resolveDataDirectory } from "@/lib/dataPaths";
import {
  negativePromptForImageStyle,
  parsePostImageStyle,
  type PostImageStyle,
} from "@/lib/postImageStyle";

export type GeneratePostImageResult =
  | {
      ok: true;
      relativePath: string;
      apiUrl: string;
      prompt: string;
      provider: ImageGenerationProvider;
      usedOvhFallback: boolean;
    }
  | { ok: false; error: string };

async function persistPostImage(
  postId: string,
  bytes: Buffer,
  prompt: string,
  provider: ImageGenerationProvider,
  usedOvhFallback: boolean,
): Promise<GeneratePostImageResult> {
  const dataDir = resolveDataDirectory();
  const mediaDir = path.join(dataDir, "media", "posts");
  await fs.mkdir(mediaDir, { recursive: true });
  const filename = `${postId}-${Date.now()}.jpg`;
  const filePath = path.join(mediaDir, filename);
  await fs.writeFile(filePath, bytes);

  return {
    ok: true,
    relativePath: `posts/${filename}`,
    apiUrl: `/api/branding/media/${filename}`,
    prompt,
    provider,
    usedOvhFallback,
  };
}

/** Post hero image: Stability SD3, then OVH SDXL if Stability fails (e.g. no credits). */
export async function generatePostImage(options: {
  postId: string;
  prompt: string;
  negativePrompt?: string;
  imageStyle?: PostImageStyle;
}): Promise<GeneratePostImageResult> {
  const settings = await getSdSettings();
  if (!settings.enabled) {
    return {
      ok: false,
      error:
        "Image generation is disabled. Enable it in Settings → Post images.",
    };
  }

  if (!hasImageGenEnvConfig()) {
    return {
      ok: false,
      error:
        "No image API configured. Add STABILITY_API_KEY or OVH_AI_ENDPOINTS_ACCESS_TOKEN to web/.env.local, then restart dev.",
    };
  }

  const prompt = options.prompt.trim();
  if (prompt.length < 8) {
    return { ok: false, error: "Describe the image in at least 8 characters." };
  }

  const style = parsePostImageStyle(options.imageStyle);
  const negative =
    options.negativePrompt ?? negativePromptForImageStyle(style);
  const ovhToken = ovhSdxlTokenFromEnv();
  const canOvh = hasOvhSdxlEnvConfig();
  const canStability = Boolean(settings.apiKey);

  if (canStability) {
    const stability = await callStabilitySd3Text2Image({
      prompt,
      negativePrompt: negative,
      apiKey: settings.apiKey!,
      endpointUrl: settings.apiUrl,
      model: settings.model,
    });

    if (stability.ok) {
      return persistPostImage(
        options.postId,
        stability.bytes,
        prompt,
        "stability",
        false,
      );
    }

    if (canOvh) {
      const ovh = await callOvhSdxlText2Image({
        prompt,
        negativePrompt: negative,
        accessToken: ovhToken!,
        endpointUrl: ovhSdxlUrlFromEnv(),
      });
      if (ovh.ok) {
        const creditFallback = stabilityErrorImpliesOvhFallback(
          stability.error,
          stability.httpStatus,
        );
        return persistPostImage(
          options.postId,
          ovh.bytes,
          prompt,
          "ovh",
          creditFallback,
        );
      }
      const stabilityHint = stabilityErrorImpliesOvhFallback(
        stability.error,
        stability.httpStatus,
      )
        ? "Stability credits exhausted. "
        : "";
      return {
        ok: false,
        error: `${stabilityHint}Stability: ${stability.error.slice(0, 200)}. OVH fallback: ${ovh.error.slice(0, 200)}`,
      };
    }

    const creditMsg = stabilityErrorImpliesOvhFallback(
      stability.error,
      stability.httpStatus,
    )
      ? " Add OVH_AI_ENDPOINTS_ACCESS_TOKEN to .env.local for free OVH SDXL fallback (same as Nemrut)."
      : "";
    return {
      ok: false,
      error: `${stability.error.slice(0, 400)}${creditMsg}`,
    };
  }

  if (canOvh) {
    const ovh = await callOvhSdxlText2Image({
      prompt,
      negativePrompt: negative,
      accessToken: ovhToken!,
      endpointUrl: ovhSdxlUrlFromEnv(),
    });
    if (ovh.ok) {
      return persistPostImage(options.postId, ovh.bytes, prompt, "ovh", false);
    }
    return { ok: false, error: ovh.error };
  }

  return { ok: false, error: "No image provider available." };
}

export { formatImageProviderLabel };
