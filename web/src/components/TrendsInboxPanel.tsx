"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type TrendItem = {
  id: string;
  title: string;
  url: string | null;
  excerpt: string | null;
  itemKind: string;
  trendScore: number | null;
  fetchedAt: string;
};

export function TrendsInboxPanel() {
  const [items, setItems] = useState<TrendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/branding/trends?limit=10");
      const data = (await res.json()) as { items?: TrendItem[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load trends.");
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    await fetch("/api/branding/trends/refresh", { method: "POST" });
    await load();
  };

  const createPostFromTrend = async (id: string) => {
    const res = await fetch(`/api/branding/trends/${id}/use`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ createPost: true }),
    });
    const data = (await res.json()) as { postId?: string; error?: string };
    if (!res.ok) {
      setError(data.error ?? "Could not create post.");
      return;
    }
    if (data.postId) {
      window.location.href = `/branding/posts/${data.postId}`;
    } else {
      await load();
    }
  };

  const dismiss = async (id: string) => {
    await fetch(`/api/branding/trends/${id}/dismiss`, { method: "POST" });
    await load();
  };

  return (
    <section className="clin-card p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="clin-section-title">Trend inbox</h2>
        <button
          type="button"
          onClick={() => void refresh()}
          className="clin-link text-xs"
        >
          Refresh
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--clin-muted)]">
        Headlines from RSS / optional Tavily — last 7 days, unused.
      </p>
      {loading && (
        <p className="mt-2 text-[var(--clin-muted)]">Loading…</p>
      )}
      {error && <p className="mt-2 text-red-600">{error}</p>}
      {!loading && items.length === 0 && (
        <p className="mt-2 text-[var(--clin-muted)]">
          Empty.{" "}
          <Link href="/settings" className="clin-link">
            Enable RSS pack
          </Link>{" "}
          in Settings.
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li
            key={it.id}
            className="rounded border border-[var(--clin-border)] p-2"
          >
            <div className="font-medium leading-snug">{it.title}</div>
            {it.url && (
              <a
                href={it.url}
                target="_blank"
                rel="noreferrer"
                className="clin-link mt-0.5 block truncate text-xs"
              >
                {it.url}
              </a>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void createPostFromTrend(it.id)}
                className="clin-btn-secondary px-2 py-0.5 text-xs"
              >
                Use for new post
              </button>
              <button
                type="button"
                onClick={() => void dismiss(it.id)}
                className="text-xs text-[var(--clin-muted)] underline"
              >
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
