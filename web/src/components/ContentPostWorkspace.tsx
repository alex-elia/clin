"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { saveContentPostAction } from "@/app/actions";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { PostPreviewHandoff } from "@/components/PostPreviewHandoff";
import { PostAutopilotPanel } from "@/components/post-autopilot/PostAutopilotPanel";
import { appendTranscriptToText } from "@/lib/speechRecognition";
import { PostWritingAssistant } from "@/components/PostWritingAssistant";
import { TutorialHelpLayer } from "@/components/tutorial/TutorialHelpLayer";
import {
  BRANDING_POST_TOUR_ID,
  BRANDING_POST_TUTORIAL,
} from "@/lib/tutorialHelp";
import type { ContentPostRow } from "@/lib/contentPosts";
import { formatPostForLinkedInClipboard } from "@/lib/linkedinPostClipboard";
import {
  CONTENT_LANGUAGE_PREF_LABELS,
  languageResolutionHint,
  parseContentLanguagePreference,
  parsePostLanguage,
  postTextForLanguageDetection,
  resolveContentLanguage,
} from "@/lib/contentLanguage";
import {
  generatePostImageClient,
  hasPostTextForImage,
  suggestPostImagePromptClient,
} from "@/lib/contentPostWorkflow";
import {
  brandingMediaDownloadUrl,
  hasRequiredPostImage,
  postFormatRequiresImage,
} from "@/lib/contentPostMedia";
import {
  CONTENT_FORMAT_LABELS,
  CONTENT_POST_FORMATS,
  CONTENT_POST_STATUSES,
  CONTENT_STATUS_LABELS,
  type ContentPostFormat,
  type ContentPostStatus,
} from "@/lib/contentPostsShared";
import {
  POST_IMAGE_STYLE_LABELS,
  POST_IMAGE_STYLES,
  type PostImageStyle,
} from "@/lib/postImageStyle";

export type PostFormPatch = Partial<{
  title: string;
  status: ContentPostStatus;
  format: ContentPostFormat;
  ideaNotes: string;
  hook: string;
  body: string;
  articleBody: string;
  scheduledAt: string;
  language: string;
}>;

type ContentPostWorkspaceProps = {
  post: ContentPostRow;
  sdEnabled: boolean;
  brandContentLanguage: string | null;
};

function toLocalDatetimeValue(d: Date | null): string {
  if (!d) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function ContentPostWorkspace({
  post,
  sdEnabled,
  brandContentLanguage,
}: ContentPostWorkspaceProps) {
  const [title, setTitle] = useState(post.title);
  const [status, setStatus] = useState(post.status as ContentPostStatus);
  const [format, setFormat] = useState(post.format as ContentPostFormat);
  const [ideaNotes, setIdeaNotes] = useState(post.ideaNotes ?? "");
  const [hook, setHook] = useState(post.hook ?? "");
  const [body, setBody] = useState(post.body ?? "");
  const [articleBody, setArticleBody] = useState(post.articleBody ?? "");
  const [scheduledAt, setScheduledAt] = useState(toLocalDatetimeValue(post.scheduledAt));
  const [language, setLanguage] = useState(post.language ?? "auto");
  const [mediaItems, setMediaItems] = useState(post.mediaJson?.items ?? []);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imagePromptSource, setImagePromptSource] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [promptLoading, setPromptLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageStyle, setImageStyle] = useState<PostImageStyle>("photo");
  const [handoffHighlight, setHandoffHighlight] = useState(false);
  const [autopilotImageGenerated, setAutopilotImageGenerated] = useState(false);

  useEffect(() => {
    setStatus(post.status as ContentPostStatus);
  }, [post.status]);

  const scrollToHandoff = useCallback(() => {
    document
      .getElementById("post-preview-handoff")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const imageDraft = useCallback(
    () => ({
      title,
      format,
      language,
      ideaNotes,
      hook,
      body,
      articleBody,
    }),
    [title, format, language, ideaNotes, hook, body, articleBody],
  );

  const coachDraft = useCallback(
    () => ({
      title,
      format,
      language,
      ideaNotes,
      hook,
      body,
      articleBody,
      brandLanguage: brandContentLanguage ?? "auto",
    }),
    [
      title,
      format,
      language,
      ideaNotes,
      hook,
      body,
      articleBody,
      brandContentLanguage,
    ],
  );

  const postHasTextForImage = hasPostTextForImage(imageDraft());

  const applyPatch = useCallback((patch: PostFormPatch) => {
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.status !== undefined) setStatus(patch.status);
    if (patch.format !== undefined) setFormat(patch.format);
    if (patch.ideaNotes !== undefined) setIdeaNotes(patch.ideaNotes);
    if (patch.hook !== undefined) setHook(patch.hook);
    if (patch.body !== undefined) setBody(patch.body);
    if (patch.articleBody !== undefined) setArticleBody(patch.articleBody);
    if (patch.scheduledAt !== undefined) setScheduledAt(patch.scheduledAt);
    if (patch.language !== undefined) setLanguage(patch.language);
  }, []);

  const languagePreview = resolveContentLanguage({
    brandPreference: parseContentLanguagePreference(brandContentLanguage),
    postLanguage: language === "auto" ? null : language,
    postText: postTextForLanguageDetection({
      title,
      ideaNotes,
      hook,
      body,
      articleBody,
    }),
  });

  const suggestImagePrompt = async () => {
    setPromptLoading(true);
    setImageError(null);
    try {
      const data = await suggestPostImagePromptClient({
        postId: post.id,
        draft: imageDraft(),
        imageStyle,
      });
      setImagePrompt(data.prompt);
      setImagePromptSource(
        data.source === "llm"
          ? "Suggested by AI from your post"
          : "Suggested from post (template)",
      );
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setPromptLoading(false);
    }
  };

  const generateImage = async (opts?: { autoFromPost?: boolean }) => {
    const auto = opts?.autoFromPost === true;
    if (!auto && imagePrompt.trim().length < 8) {
      setImageError("Describe the image, or use “Generate from post content”.");
      return;
    }
    setImageLoading(true);
    setImageError(null);
    try {
      const data = await generatePostImageClient({
        postId: post.id,
        draft: imageDraft(),
        imageStyle,
        autoFromPost: auto,
        prompt: auto ? undefined : imagePrompt.trim(),
      });
      if (data.prompt) {
        setImagePrompt(data.prompt);
      }
      const note = (data.prompt ?? imagePrompt).slice(0, 120);
      const style = data.imageStyle === "text_card" ? "text_card" : imageStyle;
      setMediaItems((items) => [
        ...items,
        {
          kind: "image" as const,
          url: data.imageUrl,
          filename: data.filename,
          style,
          note,
          alt:
            style === "text_card"
              ? "Generated quote graphic"
              : "Generated post photo",
        },
      ]);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setImageLoading(false);
    }
  };

  return (
    <TutorialHelpLayer tourId={BRANDING_POST_TOUR_ID} steps={BRANDING_POST_TUTORIAL}>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/branding/calendar" className="clin-link text-sm">
          ← Content plan
        </Link>

        <PostAutopilotPanel
          postId={post.id}
          getDraft={coachDraft}
          sdEnabled={sdEnabled}
          imageStyle={imageStyle}
          onApplyPatch={applyPatch}
          onMediaItem={(item) =>
            setMediaItems((items) => [...items, item])
          }
          onScrollToHandoff={scrollToHandoff}
          onComplete={({ imageGenerated }) => {
            setHandoffHighlight(true);
            setAutopilotImageGenerated(imageGenerated);
          }}
        />

        <PostWritingAssistant
          postId={post.id}
          coachDraft={coachDraft()}
          speechLanguage={language}
          onApplyPatch={applyPatch}
        />

        <form action={saveContentPostAction} className="space-y-6">
        <input type="hidden" name="id" value={post.id} />
        <input
          type="hidden"
          name="mediaJson"
          value={JSON.stringify({ items: mediaItems })}
        />

        <section data-tour="prepare" className="clin-card space-y-4 p-5">
          <h2 className="clin-section-title">1. Prepare</h2>
          <p className="text-xs text-[var(--clin-muted)]">
            Raw material: voice notes, quotes you heard, angle, links. The assistant turns this into a post.
          </p>
          <label className="block text-sm">
            <span className="font-medium">Brief / idea</span>
            <div className="clin-voice-field mt-1">
              <textarea
                name="ideaNotes"
                rows={5}
                value={ideaNotes}
                onChange={(e) => setIdeaNotes(e.target.value)}
                className="clin-input min-h-0 flex-1"
                placeholder="Speak or paste: voice notes, quotes, context, angle…"
              />
              <VoiceInputButton
                language={language}
                onAppend={(text) =>
                  setIdeaNotes((v) => appendTranscriptToText(v, text))
                }
              />
            </div>
          </label>
        </section>

        <section data-tour="post" className="clin-card space-y-4 p-5">
          <h2 className="clin-section-title">2. Post</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium">Title (calendar label)</span>
              <input
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="clin-input mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Format</span>
              <select
                name="format"
                value={format}
                onChange={(e) => setFormat(e.target.value as ContentPostFormat)}
                className="clin-input mt-1"
              >
                {CONTENT_POST_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {CONTENT_FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Post language</span>
              <select
                name="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="clin-input mt-1"
              >
                <option value="auto">
                  {CONTENT_LANGUAGE_PREF_LABELS.auto.label} —{" "}
                  {languageResolutionHint(languagePreview)}
                </option>
                <option value="fr">{CONTENT_LANGUAGE_PREF_LABELS.fr.label}</option>
                <option value="en">{CONTENT_LANGUAGE_PREF_LABELS.en.label}</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Schedule</span>
              <input
                type="datetime-local"
                name="scheduledAt"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="clin-input mt-1"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="font-medium">Hook</span>
            <textarea
              name="hook"
              rows={3}
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              className="clin-input mt-1"
              placeholder="Opening lines — concrete quote or tension first"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium">Body</span>
            <textarea
              name="body"
              rows={14}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="clin-input mt-1 font-mono text-sm leading-relaxed"
              placeholder="Full post (closing line and hashtags at the end, no labels)"
            />
          </label>

          {format === "article" ? (
            <label className="block text-sm">
              <span className="font-medium">Article (long form)</span>
              <textarea
                name="articleBody"
                rows={12}
                value={articleBody}
                onChange={(e) => setArticleBody(e.target.value)}
                className="clin-input mt-1 font-mono text-sm"
              />
            </label>
          ) : null}

          <label className="block text-sm">
            <span className="font-medium">Status</span>
            <select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ContentPostStatus)}
              className="clin-input mt-1 max-w-xs"
            >
              {CONTENT_POST_STATUSES.filter((s) => s !== "archived").map((s) => (
                <option key={s} value={s}>
                  {CONTENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section data-tour="visual" className="clin-card space-y-4 p-5">
          <h2 className="clin-section-title">
            3. Visual
            {postFormatRequiresImage(format) ? (
              <span className="ml-2 text-xs font-normal text-amber-800 dark:text-amber-200">
                (required for {CONTENT_FORMAT_LABELS[format].toLowerCase()})
              </span>
            ) : null}
          </h2>
          {mediaItems.length > 0 ? (
            <ul className="space-y-4">
              {mediaItems.map((item, i) => (
                <li key={i} className="text-sm space-y-2">
                  {item.url && item.kind === "image" ? (
                    <>
                      {item.style ? (
                        <span className="text-xs text-[var(--clin-muted)]">
                          {POST_IMAGE_STYLE_LABELS[item.style].label}
                        </span>
                      ) : null}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.url}
                        alt={item.alt ?? "Post visual"}
                        className="max-h-48 rounded-md border border-[var(--clin-border)]"
                      />
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={brandingMediaDownloadUrl(item.url)}
                          download={item.filename ?? true}
                          className="clin-btn-secondary text-xs"
                        >
                          Download image
                        </a>
                        <button
                          type="button"
                          className="clin-btn-secondary text-xs"
                          onClick={() =>
                            setMediaItems((items) =>
                              items.filter((_, idx) => idx !== i),
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </>
                  ) : (
                    <span className="text-[var(--clin-muted)]">{item.note ?? item.url}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[var(--clin-muted)]">
              Choose photo or text graphic, generate, then save. The extension can download
              or copy the image when the post is ready.
            </p>
          )}

          {sdEnabled ? (
            <div className="space-y-3 border-t border-[var(--clin-border)] pt-4">
              <label className="block text-sm">
                <span className="font-medium">Image type</span>
                <select
                  value={imageStyle}
                  onChange={(e) =>
                    setImageStyle(e.target.value as PostImageStyle)
                  }
                  className="clin-input mt-1 max-w-md"
                >
                  {POST_IMAGE_STYLES.map((s) => (
                    <option key={s} value={s}>
                      {POST_IMAGE_STYLE_LABELS[s].label} — {POST_IMAGE_STYLE_LABELS[s].hint}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-[var(--clin-muted)]">
                Clin builds a prompt from your post, then generates an image (Stability
                first; OVH SDXL if credits run out). Uses unsaved text on this page.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="clin-btn-primary text-sm"
                  disabled={
                    imageLoading ||
                    promptLoading ||
                    !postHasTextForImage
                  }
                  title={
                    postHasTextForImage
                      ? undefined
                      : "Add prepare notes, hook, or body first"
                  }
                  onClick={() => void generateImage({ autoFromPost: true })}
                >
                  {imageLoading ? "Generating…" : "Generate from post content"}
                </button>
                <button
                  type="button"
                  className="clin-btn-secondary text-sm"
                  disabled={promptLoading || imageLoading || !postHasTextForImage}
                  onClick={() => void suggestImagePrompt()}
                >
                  {promptLoading ? "Building prompt…" : "Preview prompt only"}
                </button>
              </div>
              <label className="block text-xs">
                <span className="font-medium text-[var(--clin-text)]">
                  Image prompt (editable)
                </span>
                {imagePromptSource ? (
                  <span className="mt-0.5 block text-[var(--clin-muted)]">
                    {imagePromptSource}
                  </span>
                ) : null}
                <div className="clin-voice-field mt-1">
                  <textarea
                    value={imagePrompt}
                    onChange={(e) => {
                      setImagePrompt(e.target.value);
                      setImagePromptSource(null);
                    }}
                    rows={4}
                    className="clin-input min-h-0 flex-1 text-sm"
                    placeholder="Speak or type the scene — or use Generate from post content"
                  />
                  <VoiceInputButton
                    language={language}
                    size="sm"
                    label="Voice image prompt"
                    onAppend={(text) => {
                      setImagePrompt((v) => appendTranscriptToText(v, text));
                      setImagePromptSource(null);
                    }}
                  />
                </div>
              </label>
              <button
                type="button"
                className="clin-btn-secondary text-sm"
                disabled={imageLoading || imagePrompt.trim().length < 8}
                onClick={() => void generateImage()}
              >
                {imageLoading ? "Generating…" : "Generate with prompt above"}
              </button>
              {imageError ? (
                <p className="text-xs text-red-700 dark:text-red-300">{imageError}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-[var(--clin-muted)]">
              Set STABILITY_API_KEY in web/.env.local, then enable in Settings.
            </p>
          )}
        </section>

        <button type="submit" className="clin-btn-primary">
          Save post
        </button>
      </form>

      <PostPreviewHandoff
        postId={post.id}
        postStatus={status}
        preview={{
          title,
          format,
          hook,
          body,
          copyText: formatPostForLinkedInClipboard({
            format,
            hook,
            body,
            articleBody,
            title,
          }),
          imageUrl:
            mediaItems.find((i) => i.kind === "image" && i.url)?.url ?? null,
        }}
        mediaItems={mediaItems}
        imageGenerated={autopilotImageGenerated}
        highlight={handoffHighlight}
      />
      </div>
    </TutorialHelpLayer>
  );
}
