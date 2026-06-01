import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

export function readNvmrcMajor() {
  for (const rel of [".nvmrc", path.join("..", ".nvmrc")]) {
    const file = path.join(webRoot, rel);
    if (!fs.existsSync(file)) continue;
    const v = fs.readFileSync(file, "utf8").trim().split(".")[0];
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function nodeMajor(execPath) {
  const r = spawnSync(execPath, ["-p", "process.version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.status !== 0) return null;
  const v = String(r.stdout ?? "").trim();
  const m = /^v(\d+)/.exec(v);
  return m ? Number(m[1]) : null;
}

function listNodeCandidates() {
  const seen = new Set();
  const out = [];
  const add = (p) => {
    if (!p) return;
    const resolved = path.resolve(p);
    if (seen.has(resolved) || !fs.existsSync(p)) return;
    seen.add(resolved);
    out.push(resolved);
  };

  add(
    path.join(
      process.env.LOCALAPPDATA ?? "",
      "Programs",
      "cursor",
      "resources",
      "app",
      "resources",
      "helpers",
      "node.exe",
    ),
  );

  if (process.env.NVM_SYMLINK) {
    add(path.join(process.env.NVM_SYMLINK, "node.exe"));
  }
  if (process.env.FNM_MULTISHELL_PATH) {
    add(path.join(process.env.FNM_MULTISHELL_PATH, "node.exe"));
  }

  add(path.join(process.env.ProgramFiles ?? "C:\\Program Files", "nodejs", "node.exe"));

  try {
    const whichCmd = process.platform === "win32" ? "where.exe" : "which";
    const which = spawnSync(whichCmd, ["node"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (which.status === 0) {
      for (const line of which.stdout.split(/\r?\n/)) {
        const t = line.trim();
        if (t) add(t);
      }
    }
  } catch {
    /* ignore */
  }

  return out;
}

/**
 * Node binary for Clin dev (Next + better-sqlite3). Honors repo `.nvmrc` when
 * `npm` was started with a different major (common on Windows: npm → 25, PATH → 22).
 */
export function resolveDevNodeExecPath() {
  const want = readNvmrcMajor();
  if (want == null) return process.execPath;

  const cur = nodeMajor(process.execPath);
  if (cur === want) return process.execPath;

  for (const candidate of listNodeCandidates()) {
    if (nodeMajor(candidate) === want) return candidate;
  }

  return process.execPath;
}

export function reexecIfNeeded(scriptRelPath) {
  const devNode = resolveDevNodeExecPath();
  if (path.resolve(devNode) === path.resolve(process.execPath)) return false;

  const nodeDir = path.dirname(devNode);
  const pathKey = process.platform === "win32" ? "Path" : "PATH";
  const prev = process.env[pathKey] ?? "";
  const env = {
    ...process.env,
    [pathKey]: `${nodeDir}${path.delimiter}${prev}`,
  };

  const script = path.join(webRoot, scriptRelPath);
  const r = spawnSync(devNode, [script, ...process.argv.slice(2)], {
    cwd: webRoot,
    stdio: "inherit",
    env,
  });
  process.exit(r.status ?? 1);
}
