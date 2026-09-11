/**
 * Production `next start` on the same port as `npm run dev` (default 3100).
 *
 *   npm run start
 *   CLIN_DEV_PORT=3200 npm run start
 *
 * Do not pass `-p` through npm: npm treats `-p` as `--prefix`.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { envWithNodeFirst } from "./lib/node-env.mjs";
import { resolveDevNodeExecPath } from "./lib/resolve-dev-node.mjs";
import { devPort, pidsOnPort, webRootPath } from "./lib/dev-runtime.mjs";

const port = devPort();
const root = webRootPath();
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const buildMarker = path.join(root, ".next", "BUILD_ID");

if (!fs.existsSync(buildMarker)) {
  console.error(
    "[clin] No production build found. From the repo root run: npm run build",
  );
  process.exit(1);
}

const listeners = pidsOnPort(port);
if (listeners.length > 0) {
  console.error(
    `[clin] Port ${port} is already in use (PID ${listeners.join(", ")}).\n` +
      `  Stop that process, or set CLIN_DEV_PORT to a free port.`,
  );
  process.exit(1);
}

console.log(`[clin] Starting production server on http://127.0.0.1:${port} …`);

const child = spawn(
  resolveDevNodeExecPath(),
  [nextBin, "start", "-p", String(port)],
  {
    cwd: root,
    stdio: "inherit",
    env: envWithNodeFirst({ PORT: String(port), NODE_ENV: "production" }),
  },
);

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
