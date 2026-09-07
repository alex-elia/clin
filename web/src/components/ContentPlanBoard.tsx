"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  BOARD_COLUMNS,
  CONTENT_STATUS_LABELS,
  type ContentPostStatus,
} from "@/lib/contentPostsShared";
import type { ContentPlanPostCard } from "@/lib/contentPlanFilters";

type Props = {
  initialPosts: ContentPlanPostCard[];
};

export function ContentPlanBoard({ initialPosts }: Props) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<ContentPostStatus | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const postsByColumn = Object.fromEntries(
    BOARD_COLUMNS.map((col) => [
      col,
      posts.filter((p) => p.status === col),
    ]),
  ) as Record<ContentPostStatus, ContentPlanPostCard[]>;

  const movePost = useCallback(
    async (postId: string, nextStatus: ContentPostStatus) => {
      const post = posts.find((p) => p.id === postId);
      if (!post || post.status === nextStatus) return;

      setBusyId(postId);
      setError(null);
      const prev = posts;
      setPosts((list) =>
        list.map((p) => (p.id === postId ? { ...p, status: nextStatus } : p)),
      );

      try {
        const res = await fetch(`/api/branding/posts/${postId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setPosts(prev);
          setError(data?.error || `HTTP ${res.status}`);
          return;
        }
        router.refresh();
      } catch (e) {
        setPosts(prev);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyId(null);
        setDraggingId(null);
        setOverColumn(null);
      }
    },
    [posts, router],
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--clin-muted)]">
        Drag cards between columns to change status. Drop on a column header or
        any card slot.
      </p>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {BOARD_COLUMNS.map((col) => {
          const columnPosts = postsByColumn[col] ?? [];
          const isOver = overColumn === col;
          return (
            <div
              key={col}
              className={`rounded-lg border p-3 transition-colors ${
                isOver
                  ? "border-[var(--clin-accent)] bg-[var(--clin-accent)]/5"
                  : "border-[var(--clin-border)] bg-[var(--clin-surface-muted)]/40"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setOverColumn(col);
              }}
              onDragLeave={() => {
                setOverColumn((c) => (c === col ? null : c));
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/post-id") || draggingId;
                if (id) void movePost(id, col);
              }}
            >
              <h3
                className="text-sm font-semibold"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const id =
                    e.dataTransfer.getData("text/post-id") || draggingId;
                  if (id) void movePost(id, col);
                }}
              >
                {CONTENT_STATUS_LABELS[col]}
                <span className="ml-1 text-xs font-normal tabular-nums text-[var(--clin-muted)]">
                  ({columnPosts.length})
                </span>
              </h3>
              <ul className="mt-2 min-h-[4rem] space-y-2">
                {columnPosts.map((p) => {
                  const busy = busyId === p.id;
                  return (
                    <li
                      key={p.id}
                      draggable={!busy}
                      onDragStart={(e) => {
                        setDraggingId(p.id);
                        e.dataTransfer.setData("text/post-id", p.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverColumn(null);
                      }}
                      className={`clin-card cursor-grab p-2 text-sm active:cursor-grabbing ${
                        draggingId === p.id ? "opacity-50" : ""
                      } ${busy ? "opacity-60" : ""}`}
                    >
                      <Link
                        href={`/branding/posts/${p.id}`}
                        className="clin-link font-medium"
                        onClick={(e) => {
                          if (draggingId) e.preventDefault();
                        }}
                      >
                        {p.title}
                      </Link>
                      {p.scheduledAt ? (
                        <p className="mt-1 text-[10px] text-[var(--clin-muted)]">
                          {new Date(p.scheduledAt).toLocaleDateString()}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
