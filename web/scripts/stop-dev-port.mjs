/**
 * Stop Clin dev: lock PID, default port, and any Clin on 3000..3010.
 *
 *   npm run dev:stop
 */
import { execSync } from "node:child_process";
import {
  devPort,
  findClinDevListeners,
  pidsOnPort,
  readLock,
  removeLock,
  isPidAlive,
} from "./lib/dev-runtime.mjs";

const port = devPort();

function killWindows(pid) {
  execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
}

function killPid(pid, label) {
  try {
    if (process.platform === "win32") killWindows(pid);
    else process.kill(pid, "SIGTERM");
    console.log(`[clin] Stopped ${label} PID ${pid}.`);
  } catch (e) {
    console.warn(
      `[clin] Could not stop ${label} PID ${pid}:`,
      e instanceof Error ? e.message : e,
    );
  }
}

const lock = readLock();
if (lock?.pid && isPidAlive(lock.pid)) {
  killPid(lock.pid, "lock");
}
removeLock();

const clinListeners = await findClinDevListeners();
const killed = new Set();

for (const { port: p, pids, dbPath } of clinListeners) {
  for (const pid of pids) {
    if (killed.has(pid)) continue;
    killPid(pid, `Clin on :${p}`);
    killed.add(pid);
  }
  if (dbPath) {
    console.log(`[clin] Was serving ${dbPath} on port ${p}.`);
  }
}

if (killed.size === 0) {
  const fallback = pidsOnPort(port);
  if (fallback.length === 0) {
    console.log(`[clin] No Clin listener on ports 3000–3010 (or port ${port}).`);
  } else {
    for (const pid of fallback) {
      if (!killed.has(pid)) killPid(pid, `port ${port}`);
    }
  }
}
