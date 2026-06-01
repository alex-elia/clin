import fs from "node:fs";
import path from "node:path";

/** `web/.env.local` exists (Next.js loads it at startup). */
export function hasEnvLocalFile(): boolean {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, ".env.local"),
    path.join(cwd, "web", ".env.local"),
  ];
  return candidates.some((p) => fs.existsSync(p));
}
