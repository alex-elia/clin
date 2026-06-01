"use client";

import { useActionState, useCallback, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  archiveContentPostAction,
  markContentPostPublishedAction,
  markContentPostReadyAction,
} from "@/app/actions";
import type { ContentMediaItem } from "@/db/schema";
import {
  brandingMediaDownloadUrl,
  hasRequiredPostImage,
} from "@/lib/contentPostMedia";
import {
  CONTENT_FORMAT_LABELS,
  CONTENT_STATUS_LABELS,
  type ContentPostFormat,
  type ContentPostStatus,
} from "@/lib/contentPostsShared";

export type PostHandoffPreview = {
  title: string;
  format: string;
  hook: string;
  body: string;
  copyText: string;
  imageUrl?: string | null;
};

type PostPreviewHandoffProps = {
  postId: string;
  postStatus: ContentPostStatus;
  preview: PostHandoffPreview;
  mediaItems: ContentMediaItem[];
  imageGenerated?: boolean;
  highlight?: boolean;
};

type HandoffActionState = { error: string | null };

const initialHandoffState: HandoffActionState = { error: null };

function isNextRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest: string }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

async function runHandoffAction(
  action: (formData: FormData) => Promise<void>,
  _prev: HandoffActionState,
  formData: FormData,
): Promise<HandoffActionState> {
  try {
    await action(formData);
    return { error: null };
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    return {
      error: e instanceof Error ? e.message : "Action failed.",
    };
  }
}

function HandoffSubmitButton({
  label,
  className,
  disabled,
  title,
}: {
  label: string;
  className: string;
  disabled?: boolean;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled || pending}
      title={title}
    >
      {pending ? "…" : label}
    </button>
  );
}

function HandoffHiddenFields({
  postId,
  preview,
  mediaItems,
}: {
  postId: string;
  preview: PostHandoffPreview;
  mediaItems: ContentMediaItem[];
}) {
  return (
    <>
      <input type="hidden" name="id" value={postId} />
      <input type="hidden" name="title" value={preview.title} />
      <input type="hidden" name="format" value={preview.format} />
      <input type="hidden" name="hook" value={preview.hook} />
      <input type="hidden" name="body" value={preview.body} />
      <input
        type="hidden"
        name="mediaJson"
        value={JSON.stringify({ items: mediaItems })}
      />
    </>
  );
}

export function PostPreviewHandoff({
  postId,
  postStatus,
  preview,
  mediaItems,
  imageGenerated,
  highlight,
}: PostPreviewHandoffProps) {
  const [copied, setCopied] = useState(false);
  const imageReady = hasRequiredPostImage(
    { items: mediaItems },
    preview.format as ContentPostFormat,
  );

  const [readyState, markReadyAction, readyPending] = useActionState(
    async (prev: HandoffActionState, formData: FormData) => {
      if (!imageReady) {
        return {
          error:
            "Add a photo or text graphic in section 3, then try again (we sync from this page).",
        };
      }
      return runHandoffAction(markContentPostReadyAction, prev, formData);
    },
    initialHandoffState,
  );
  const [publishedState, markPublished, publishedPending] = useActionState(
    (prev: HandoffActionState, fd: FormData) =>
      runHandoffAction(markContentPostPublishedAction, prev, fd),
    initialHandoffState,
  );
  const [archiveState, archivePost, archivePending] = useActionState(
    (prev: HandoffActionState, fd: FormData) =>
      runHandoffAction(archiveContentPostAction, prev, fd),
    initialHandoffState,
  );

  const formatLabel =
    CONTENT_FORMAT_LABELS[preview.format as ContentPostFormat] ??
    preview.format;
  const hasCopy = preview.copyText.trim().length > 0;

  const actionError =
    readyState.error ?? publishedState.error ?? archiveState.error;
  const anyPending = readyPending || publishedPending || archivePending;

  const copyPost = useCallback(async () => {
    const text = preview.copyText.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text.replace(/\r\n/g, "\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy post:", text);
    }
  }, [preview.copyText]);

  return (
    <section
      id="post-preview-handoff"
      data-tour="preview"
      className={[
        "clin-card space-y-4 p-5",
        highlight ? "ring-2 ring-[var(--clin-accent)]/40" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div>
        <h2 className="clin-section-title">Preview &amp; handoff</h2>
        <p className="mt-1 text-xs text-[var(--clin-muted)]">
          Matches what the Clin extension copies. Handoff buttons save your
          current hook, body, and images from this page, then update status.
        </p>
        <p className="mt-2 text-xs text-[var(--clin-muted)]">
          Status:{" "}
          <span className="font-medium text-[var(--clin-text)]">
            {CONTENT_STATUS_LABELS[postStatus]}
          </span>
        </p>
      </div>

      <div className="clin-autopilot-finale-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--clin-border)] pb-3">
          <p className="font-semibold text-[var(--clin-text)]">
            {preview.title.trim() || "Untitled post"}
          </p>
          <span className="text-xs text-[var(--clin-muted)]">{formatLabel}</span>
        </div>

        {preview.imageUrl ? (
          <div className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.imageUrl}
              alt="Post visual"
              className="max-h-44 w-full rounded-md border border-[var(--clin-border)] object-cover"
            />
            {imageGenerated ? (
              <p className="mt-1 text-xs text-[var(--clin-muted)]">
                Generated visual — download below or from the extension.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 space-y-3">
          {preview.hook.trim() ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--clin-muted)]">
                Hook
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm font-medium leading-relaxed text-[var(--clin-text)]">
                {preview.hook.trim()}
              </p>
            </div>
          ) : null}
          {preview.body.trim() ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--clin-muted)]">
                Post
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--clin-text)]">
                {preview.body.trim()}
              </p>
            </div>
          ) : null}
        </div>

        {hasCopy ? (
          <details
            className="mt-4 text-xs"
            open={!preview.hook.trim() && !preview.body.trim()}
          >
            <summary className="cursor-pointer text-[var(--clin-accent)]">
              LinkedIn paste preview
            </summary>
            <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-[var(--clin-surface-muted)] p-3 font-mono text-[11px] leading-relaxed">
              {preview.copyText.trim()}
            </pre>
          </details>
        ) : (
          <p className="mt-3 text-sm text-[var(--clin-muted)]">—</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {hasCopy ? (
          <button
            type="button"
            className="clin-btn-secondary text-sm"
            disabled={anyPending}
            onClick={() => void copyPost()}
          >
            {copied ? "Copied" : "Copy for LinkedIn"}
          </button>
        ) : null}
        {preview.imageUrl ? (
          <a
            href={brandingMediaDownloadUrl(preview.imageUrl)}
            download
            className="clin-btn-secondary text-sm"
          >
            Download image
          </a>
        ) : null}
      </div>

      <div className="border-t border-[var(--clin-border)] pt-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
          Pipeline status
        </p>
        <div className="flex flex-wrap gap-2">
          <form action={markReadyAction}>
            <HandoffHiddenFields
              postId={postId}
              preview={preview}
              mediaItems={mediaItems}
            />
            <HandoffSubmitButton
              label="Mark ready for extension"
              className="clin-btn-primary text-sm"
              title={
                imageReady
                  ? undefined
                  : "Requires an image for feed and carousel posts"
              }
            />
          </form>
          <form action={markPublished}>
            <HandoffHiddenFields
              postId={postId}
              preview={preview}
              mediaItems={mediaItems}
            />
            <HandoffSubmitButton
              label="Mark published"
              className="clin-btn-secondary text-sm"
            />
          </form>
          <form action={archivePost}>
            <HandoffHiddenFields
              postId={postId}
              preview={preview}
              mediaItems={mediaItems}
            />
            <HandoffSubmitButton
              label="Archive"
              className="clin-btn-secondary text-sm text-red-800 dark:text-red-200"
            />
          </form>
        </div>
        {actionError ? (
          <p className="mt-2 text-sm text-red-700 dark:text-red-300">{actionError}</p>
        ) : null}
        {!imageReady &&
        (preview.format === "feed" || preview.format === "carousel") ? (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
            Feed and carousel posts need an image in section 3 before marking
            ready.
          </p>
        ) : null}
      </div>
    </section>
  );
}
