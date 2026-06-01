/** LinkedIn post visual style for generation and validation. */

export const POST_IMAGE_STYLES = ["photo", "text_card"] as const;
export type PostImageStyle = (typeof POST_IMAGE_STYLES)[number];

export const POST_IMAGE_STYLE_LABELS: Record<
  PostImageStyle,
  { label: string; hint: string }
> = {
  photo: {
    label: "Photo",
    hint: "Realistic editorial photo — no text in the image",
  },
  text_card: {
    label: "Text graphic",
    hint: "Quote card with short headline text (2–8 words)",
  },
};

export function parsePostImageStyle(
  raw: string | null | undefined,
): PostImageStyle {
  return raw === "text_card" ? "text_card" : "photo";
}

export function negativePromptForImageStyle(style: PostImageStyle): string {
  if (style === "text_card") {
    return "watermark, logo, blurry, low quality, deformed, ugly, cluttered layout, tiny illegible text, more than 12 words";
  }
  return "text, words, letters, typography, watermark, logo, blurry, low quality, deformed, ugly";
}
