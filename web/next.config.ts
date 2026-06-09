import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * If you serve Clin behind a path prefix (e.g. https://host/clin/ → proxy to Next),
 * set CLIN_BASE_PATH=/clin so script and CSS URLs use /clin/_next/... instead of /_next/...
 * (otherwise the HTML loads but all chunks 404).
 */
function optionalBasePath(): string | undefined {
  const raw = process.env.CLIN_BASE_PATH?.trim();
  if (!raw || raw === "/") return undefined;
  const withLead = raw.startsWith("/") ? raw : `/${raw}`;
  const normalized = withLead.replace(/\/+$/, "");
  return normalized === "" ? undefined : normalized;
}

const isDesktopStandalone = process.env.CLIN_DESKTOP_STANDALONE === "1";

const nextConfig: NextConfig = {
  basePath: optionalBasePath(),
  output: isDesktopStandalone ? "standalone" : undefined,
  // Parent folders may contain unrelated lockfiles; pin tracing to this app.
  outputFileTracingRoot: webRoot,
  turbopack: {
    root: webRoot,
  },
  serverExternalPackages: ["better-sqlite3", "bindings"],
};

export default nextConfig;
