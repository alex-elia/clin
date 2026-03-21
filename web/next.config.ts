import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Parent folders may contain unrelated lockfiles; pin tracing to this app.
  outputFileTracingRoot: webRoot,
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
