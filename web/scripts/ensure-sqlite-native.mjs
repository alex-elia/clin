/**
 * better-sqlite3 must match the Node binary that runs `next dev`.
 * Native code loads only on `new Database()` — not on `require()` alone.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { envWithNodeFirst, spawnNpm } from "./lib/node-env.mjs";
import { reexecIfNeeded } from "./lib/resolve-dev-node.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
reexecIfNeeded("scripts/ensure-sqlite-native.mjs");

const require = createRequire(path.join(root, "package.json"));

function tryLoad() {
  try {
    const Database = require("better-sqlite3");
    const db = new Database(":memory:");
    db.close();
    return true;
  } catch {
    return false;
  }
}

const node = process.execPath;
const modules = process.versions.modules;

if (tryLoad()) {
  console.log(
    `[clin] better-sqlite3 OK (Node ${process.version}, modules ${modules}, ${node}).`,
  );
  process.exit(0);
}

console.warn(
  `[clin] better-sqlite3 not built for Node ${process.version} (modules ${modules}). Rebuilding…`,
);

function runRebuild(fromSource) {
  const env = envWithNodeFirst(
    fromSource ? { npm_config_build_from_source: "true" } : {},
  );
  return spawnNpm(["rebuild", "better-sqlite3"], {
    cwd: root,
    env,
    stdio: "inherit",
  });
}

let r = runRebuild(false);
if (r.error) {
  console.error(`[clin] npm rebuild failed to start: ${r.error.message}`);
  process.exit(1);
}
if (r.status !== 0) {
  console.warn("[clin] Prebuilt binary unavailable; compiling from source…");
  r = runRebuild(true);
  if (r.error) {
    console.error(`[clin] npm rebuild failed to start: ${r.error.message}`);
    process.exit(1);
  }
}

if (r.status !== 0) process.exit(r.status ?? 1);
if (!tryLoad()) {
  console.error(
    `[clin] Rebuild finished but load still fails. Run manually:\n` +
      `  cd web\n  npm run rebuild:native\n` +
      `using the same Node as "npm run dev":\n  ${node}`,
  );
  process.exit(1);
}
console.log("[clin] Rebuild succeeded.");
