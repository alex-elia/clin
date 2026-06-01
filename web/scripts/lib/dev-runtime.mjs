import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const webRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

export const DEFAULT_DEV_PORT = 3000;
export const DEV_PORT_SCAN_MAX =
  Number(process.env.CLIN_DEV_SCAN_MAX) > 0
    ? Number(process.env.CLIN_DEV_SCAN_MAX)
    : 3010;

export function devPort() {
  const raw = process.env.CLIN_DEV_PORT || process.env.PORT || "";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DEV_PORT;
}

export function lockFilePath() {
  return path.join(webRoot, "data", ".clin-dev.lock");
}

export function readLock() {
  const file = lockFilePath();
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function writeLock(data) {
  const file = lockFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function removeLock() {
  try {
    fs.unlinkSync(lockFilePath());
  } catch {
    /* ignore */
  }
}

export function isPidAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function pidsOnPort(port) {
  if (process.platform === "win32") {
    try {
      const out = execSync(`netstat -ano | findstr ":${port}.*LISTENING"`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        const m = line.trim().match(/LISTENING\s+(\d+)\s*$/i);
        if (m) pids.add(Number(m[1]));
      }
      return [...pids];
    } catch {
      return [];
    }
  }
  try {
    const out = execSync(`lsof -ti :${port}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return out
      .split(/\s+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

export async function fetchClinHealth(port, timeoutMs = 2500) {
  const url = `http://127.0.0.1:${port}/api/health`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, url };
    const body = await res.json();
    if (body?.service !== "clin") {
      return {
        ok: false,
        error: `Port ${port} is not Clin (service=${body?.service ?? "?"})`,
        url,
        body,
      };
    }
    return { ok: true, url, body };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, url };
  }
}

export function webRootPath() {
  return webRoot;
}

/** Find Clin dev servers on 3000..CLIN_DEV_SCAN_MAX (catches orphaned :3001, etc.). */
export async function findClinDevListeners() {
  const found = [];
  const end = Math.max(DEFAULT_DEV_PORT, DEV_PORT_SCAN_MAX);
  for (let p = DEFAULT_DEV_PORT; p <= end; p++) {
    const pids = pidsOnPort(p);
    if (pids.length === 0) continue;
    const health = await fetchClinHealth(p, 1500);
    if (health.ok) {
      found.push({ port: p, pids, dbPath: health.body?.dbPath ?? null });
    }
  }
  return found;
}
