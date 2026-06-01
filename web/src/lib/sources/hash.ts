import { createHash } from "node:crypto";

export function hashSourceItem(title: string, url?: string): string {
  const base = `${(url ?? "").trim().toLowerCase()}|${title.trim().toLowerCase()}`;
  return createHash("sha256").update(base).digest("hex").slice(0, 32);
}
