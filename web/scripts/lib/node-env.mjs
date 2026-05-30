import fs from "node:fs";
import path from "node:path";

/** Put the Node binary that runs this script first on PATH (Next/npm child processes). */
export function envWithNodeFirst(extra = {}) {
  const nodeDir = path.dirname(process.execPath);
  const pathKey = process.platform === "win32" ? "Path" : "PATH";
  const prev = process.env[pathKey] ?? "";
  const prefix = prev.toLowerCase().startsWith(nodeDir.toLowerCase())
    ? prev
    : `${nodeDir}${path.delimiter}${prev}`;
  return { ...process.env, ...extra, [pathKey]: prefix };
}

/** npm-cli.js next to the current Node install (rebuild uses the same ABI). */
export function resolveNpmCli() {
  const base = path.dirname(process.execPath);
  const candidates = [
    path.join(base, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(base, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(base, "..", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}
