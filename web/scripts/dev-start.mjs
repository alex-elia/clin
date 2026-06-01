/**
 * Start Clin dev with a fixed port, singleton guard, and PID lock file.
 *
 *   npm run dev
 *   CLIN_DEV_PORT=3001 npm run dev
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { envWithNodeFirst } from "./lib/node-env.mjs";
import { reexecIfNeeded, resolveDevNodeExecPath } from "./lib/resolve-dev-node.mjs";
import {
  devPort,
  fetchClinHealth,
  findClinDevListeners,
  isPidAlive,
  pidsOnPort,
  readLock,
  removeLock,
  webRootPath,
  writeLock,
} from "./lib/dev-runtime.mjs";

const port = devPort();
const root = webRootPath();
reexecIfNeeded("scripts/dev-start.mjs");
const devNode = resolveDevNodeExecPath();

function fail(msg) {
  console.error(`[clin] ${msg}`);
  process.exit(1);
}

async function assertCanStart() {
  const lock = readLock();
  if (lock?.pid && isPidAlive(lock.pid)) {
    const health = await fetchClinHealth(lock.port ?? port);
    if (health.ok) {
      fail(
        `Clin dev already running (PID ${lock.pid}, port ${lock.port ?? port}).\n` +
          `  DB: ${health.body.dbPath ?? "?"}\n` +
          `  Stop it: npm run dev:stop`,
      );
    }
  } else if (lock) {
    removeLock();
  }

  const existing = await findClinDevListeners();
  if (existing.length > 0) {
    const lines = existing.map(
      (e) => `  · port ${e.port} (PID ${e.pids.join(", ")})`,
    );
    fail(
      `Clin dev already running on:\n${lines.join("\n")}\n` +
        `  Stop all: npm run dev:stop`,
    );
  }

  const listeners = pidsOnPort(port);
  if (listeners.length > 0) {
    const health = await fetchClinHealth(port);
    if (health.ok) {
      fail(
        `Port ${port} already serves Clin (PID ${listeners.join(", ")}).\n` +
          `  Run: npm run dev:stop`,
      );
    }
    fail(
      `Port ${port} is in use (PID ${listeners.join(", ")}) but it is not Clin.\n` +
        `  Free the port or set CLIN_DEV_PORT to another value.`,
    );
  }
}

function runPredev() {
  return new Promise((resolve, reject) => {
    const child = spawn(devNode, ["scripts/ensure-sqlite-native.mjs"], {
      cwd: root,
      stdio: "inherit",
      env: envWithNodeFirst(),
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`predev exited with ${code}`));
    });
  });
}

async function main() {
  await assertCanStart();
  await runPredev();

  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const args = ["dev", "-p", String(port)];

  console.log(
    `[clin] Starting Next.js on http://127.0.0.1:${port} (Node ${devNode}) …`,
  );

  const child = spawn(devNode, [nextBin, ...args], {
    cwd: root,
    stdio: "inherit",
    env: envWithNodeFirst({ PORT: String(port) }),
  });

  writeLock({
    pid: child.pid,
    port,
    startedAt: new Date().toISOString(),
    node: devNode,
    nodeVersion: process.version,
  });

  const cleanup = () => {
    removeLock();
  };

  child.on("exit", (code, signal) => {
    cleanup();
    process.exit(code ?? (signal ? 1 : 0));
  });

  process.on("SIGINT", () => {
    child.kill("SIGINT");
  });
  process.on("SIGTERM", () => {
    child.kill("SIGTERM");
  });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
