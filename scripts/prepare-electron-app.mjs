import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const webRoot = path.join(root, "web");
const standaloneSrc = path.join(webRoot, ".next", "standalone");
const staticSrc = path.join(webRoot, ".next", "static");
const publicSrc = path.join(webRoot, "public");
const drizzleSrc = path.join(webRoot, "drizzle");
const appOut = path.join(root, "desktop-app");

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyRequired(src, dst, label) {
  if (!(await exists(src))) {
    throw new Error(`[desktop] Missing ${label}: ${src}`);
  }
  await fs.cp(src, dst, { recursive: true, force: true });
}

async function main() {
  await fs.rm(appOut, { recursive: true, force: true });
  await fs.mkdir(appOut, { recursive: true });

  await copyRequired(standaloneSrc, appOut, "Next standalone output");
  await copyRequired(staticSrc, path.join(appOut, ".next", "static"), "Next static assets");
  await copyRequired(publicSrc, path.join(appOut, "public"), "public assets");
  await copyRequired(drizzleSrc, path.join(appOut, "drizzle"), "Drizzle migrations");

  console.log(`[desktop] Prepared runtime app at ${appOut}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

