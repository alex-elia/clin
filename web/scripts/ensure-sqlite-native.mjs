/**
 * better-sqlite3 must match the Node binary that runs `next dev`.
 * Native code loads only on `new Database()` — not on `require()` alone.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { envWithNodeFirst, resolveNpmCli } from "./lib/node-env.mjs";
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

const npmCli = resolveNpmCli();
const rebuildArgs = ["rebuild", "better-sqlite3"];
const r = npmCli
  ? spawnSync(process.execPath, [npmCli, ...rebuildArgs], {
      cwd: root,
      stdio: "inherit",
      env: envWithNodeFirst({ npm_config_build_from_source: "true" }),
    })
  : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", rebuildArgs, {
      cwd: root,
      stdio: "inherit",
      env: envWithNodeFirst({ npm_config_build_from_source: "true" }),
    });

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
