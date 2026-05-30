import type { ContentMediaItem, ContentMediaJson } from "@/db/schema";
import type { ContentPostFormat } from "@/lib/contentPostsShared";
import type { PostImageStyle } from "@/lib/postImageStyle";

export type ExtensionPostImage = {
  url: string;
  downloadUrl: string;
  filename: string | null;
  style: PostImageStyle | null;
  alt: string | null;
};

export function mediaUrlToFilename(url: string): string | null {
  const m = url.match(/\/api\/branding\/media\/([^/?#]+)$/i);
  return m?.[1] ?? null;
}

export function brandingMediaDownloadUrl(apiUrl: string): string {
  const sep = apiUrl.includes("?") ? "&" : "?";
  return `${apiUrl}${sep}download=1`;
}

export function listPostImages(
  mediaJson: ContentMediaJson | null | undefined,
): ContentMediaItem[] {
  return (mediaJson?.items ?? []).filter(
    (i) => i.kind === "image" && typeof i.url === "string" && i.url.trim(),
  );
}

export function postFormatRequiresImage(format: string): boolean {
  return format === "feed" || format === "carousel";
}

export function hasRequiredPostImage(
  mediaJson: ContentMediaJson | null | undefined,
  format: string,
): boolean {
  if (!postFormatRequiresImage(format)) return true;
  return listPostImages(mediaJson).length > 0;
}

export function extensionImagesFromPost(
  mediaJson: ContentMediaJson | null | undefined,
): ExtensionPostImage[] {
  return listPostImages(mediaJson).map((item) => {
    const url = item.url!.trim();
    const style =
      item.style === "text_card" || item.style === "photo" ? item.style : null;
    return {
      url,
      downloadUrl: brandingMediaDownloadUrl(url),
      filename: item.filename ?? mediaUrlToFilename(url),
      style,
      alt: item.alt ?? null,
    };
  });
}

export function primaryPostImage(
  mediaJson: ContentMediaJson | null | undefined,
): ExtensionPostImage | null {
  const images = extensionImagesFromPost(mediaJson);
  return images[0] ?? null;
}
