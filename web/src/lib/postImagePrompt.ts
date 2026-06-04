import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";
import type { ContentPostRow } from "@/lib/contentPosts";
import {
  parseContentLanguagePreference,
  resolveContentLanguage,
} from "@/lib/contentLanguage";
import { completeChat, getLlmConfig } from "@/lib/llm/completeChat";
import {
  parsePostImageStyle,
  type PostImageStyle,
} from "@/lib/postImageStyle";

export type PostImageDraft = {
  title?: string;
  format?: string;
  language?: string;
  ideaNotes?: string;
  hook?: string;
  body?: string;
  articleBody?: string;
};

export type PostImagePromptSource = {
  title: string;
  format: string;
  language: string | null;
  ideaNotes: string | null;
  hook: string | null;
  body: string | null;
  articleBody: string | null;
};

export type BrandImageContext = {
  expertiseSummary: string | null;
  contentDoctrine: string | null;
};

export function mergePostForImagePrompt(
  post: ContentPostRow,
  draft?: PostImageDraft,
): PostImagePromptSource {
  return {
    title: draft?.title?.trim() || post.title,
    format: draft?.format?.trim() || post.format,
    language: draft?.language ?? post.language ?? null,
    ideaNotes:
      draft?.ideaNotes !== undefined
        ? draft.ideaNotes.trim() || null
        : post.ideaNotes,
    hook: draft?.hook !== undefined ? draft.hook.trim() || null : post.hook,
    body: draft?.body !== undefined ? draft.body.trim() || null : post.body,
    articleBody:
      draft?.articleBody !== undefined
        ? draft.articleBody.trim() || null
        : post.articleBody,
  };
}

export async function loadBrandImageContext(): Promise<BrandImageContext> {
  const brand = await getOrCreateContentBrandContext();
  return {
    expertiseSummary: brand.expertiseSummary,
    contentDoctrine: brand.contentDoctrine,
  };
}

function postTextForImage(source: PostImagePromptSource): string {
  const parts: string[] = [source.title.trim()];
  if (source.ideaNotes?.trim()) parts.push(source.ideaNotes.trim());
  if (source.hook?.trim()) parts.push(source.hook.trim());
  if (source.body?.trim()) parts.push(source.body.trim());
  if (source.format === "article" && source.articleBody?.trim()) {
    parts.push(source.articleBody.trim().slice(0, 2000));
  }
  return parts.join("\n\n");
}

function stripModelPreamble(text: string): string {
  const fence = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  return text.replace(/^prompt:\s*/i, "").trim();
}

export function buildImagePromptFallback(
  source: PostImagePromptSource,
  brand?: BrandImageContext,
  imageStyle: PostImageStyle = "photo",
): string {
  const text = postTextForImage(source);
  const theme = text.replace(/\s+/g, " ").trim().slice(0, 400);
  const expertise = brand?.expertiseSummary?.trim();
  const hook = source.hook?.trim().slice(0, 80);
  const parts =
    imageStyle === "text_card"
      ? [
          "Professional LinkedIn quote card graphic",
          "bold sans-serif typography on a clean gradient background",
          "minimal layout",
          "high contrast",
          "2 to 6 words of large readable text only",
          "no photo of people",
          "no logos",
          "no watermarks",
        ]
      : [
          "Professional editorial photograph for a LinkedIn business post",
          "authentic modern workplace or conference setting",
          "soft natural lighting",
          "shallow depth of field",
          "no text",
          "no logos",
          "no watermarks",
          "no readable screens",
        ];
  if (imageStyle === "text_card" && hook) {
    parts.push(`text to display: "${hook}"`);
  }
  if (theme) parts.push(`visual theme inspired by: ${theme}`);
  if (expertise) parts.push(`author context: ${expertise}`);
  return parts.join(", ").slice(0, 1800);
}

function imagePromptSystem(imageStyle: PostImageStyle): string {
  if (imageStyle === "text_card") {
    return `You write a single image-generation prompt for Stability AI SD3 (text-to-image).

Output ONLY the prompt text in English (no markdown, no quotes, no preamble). Max 1200 characters.

Rules:
- Design a professional LinkedIn quote / insight card (graphic design, not a photo)
- Include a short headline (2–8 words) taken from the post hook when possible — spell it exactly
- Clean typography, strong contrast, modern B2B palette, plenty of whitespace
- No logos, watermarks, URLs, or long paragraphs of text
- Avoid celebrity names and copyrighted characters
- No NSFW or sensational imagery`;
  }
  return `You write a single image-generation prompt for Stability AI SD3 (text-to-image).

Output ONLY the prompt text in English (no markdown, no quotes, no preamble). Max 1200 characters.

Rules:
- One concrete scene or metaphor that fits the LinkedIn post — not a literal screenshot of the post text
- Professional B2B / thought-leadership aesthetic: real photography or clean cinematic illustration
- Specify lighting, composition, subject, mood
- NEVER ask for text, logos, watermarks, UI mockups, or readable words in the image
- Avoid celebrity names, copyrighted characters, or identifiable private individuals
- Prefer inclusive, European business contexts when location is implied
- No NSFW or sensational imagery`;
}

export async function buildImagePromptFromPost(
  source: PostImagePromptSource,
  brand?: BrandImageContext,
  imageStyle: PostImageStyle = "photo",
): Promise<{ prompt: string; source: "llm" | "fallback" }> {
  const text = postTextForImage(source);
  if (text.replace(/\s/g, "").length < 24) {
    return {
      prompt: buildImagePromptFallback(source, brand, imageStyle),
      source: "fallback",
    };
  }

  const brandCtx = brand ?? (await loadBrandImageContext());
  const brandRow = await getOrCreateContentBrandContext();
  const resolved = resolveContentLanguage({
    brandPreference: parseContentLanguagePreference(brandRow.contentLanguage),
    postLanguage: source.language ?? null,
    postText: text,
  });

  try {
    const llm = await getLlmConfig();
    const user = JSON.stringify(
      {
        post_format: source.format,
        post_language: resolved.language,
        image_style: imageStyle,
        post_content: text.slice(0, 6000),
        author_expertise: brandCtx.expertiseSummary ?? null,
        content_principles: brandCtx.contentDoctrine?.slice(0, 800) ?? null,
        note:
          imageStyle === "text_card"
            ? "Quote-card graphic with short readable text; prompt in English."
            : "Photo scene, no text in image; prompt in English; topic matches post_language.",
      },
      null,
      2,
    );

    const raw = await completeChat({
      config: llm,
      system: imagePromptSystem(imageStyle),
      user,
      timeoutMs: 60_000,
      feature: "post_image_prompt",
    });

    const prompt = stripModelPreamble(raw).trim();
    if (prompt.length < 24) {
      throw new Error("Prompt too short.");
    }
    return { prompt: prompt.slice(0, 2000), source: "llm" };
  } catch {
    return {
      prompt: buildImagePromptFallback(source, brand, imageStyle),
      source: "fallback",
    };
  }
}

export async function resolveImagePromptForPost(options: {
  post: ContentPostRow;
  draft?: PostImageDraft;
  prompt?: string;
  autoFromPost?: boolean;
  imageStyle?: PostImageStyle;
}): Promise<
  | { ok: true; prompt: string; generated: boolean; promptSource: "manual" | "llm" | "fallback" }
  | { ok: false; error: string }
> {
  const manual = options.prompt?.trim();
  if (manual && manual.length >= 8) {
    return {
      ok: true,
      prompt: manual,
      generated: false,
      promptSource: "manual",
    };
  }

  if (!options.autoFromPost) {
    return {
      ok: false,
      error:
        "Add a short image description (8+ characters) or use “Generate from post content”.",
    };
  }

  const source = mergePostForImagePrompt(options.post, options.draft);
  const brand = await loadBrandImageContext();
  const imageStyle = parsePostImageStyle(options.imageStyle);
  const built = await buildImagePromptFromPost(source, brand, imageStyle);

  return {
    ok: true,
    prompt: built.prompt,
    generated: true,
    promptSource: built.source,
  };
}
