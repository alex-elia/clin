import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const webRoot = path.join(repoRoot, "web");
const eslintBin = path.join(webRoot, "node_modules", "eslint", "bin", "eslint.js");

const relFiles = process.argv
  .slice(2)
  .map((file) => path.resolve(file))
  .map((abs) => path.relative(webRoot, abs).split(path.sep).join("/"))
  .filter((rel) => rel && !rel.startsWith(".."));

if (relFiles.length === 0) {
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  [eslintBin, "--fix", "--max-warnings", "0", ...relFiles],
  { cwd: webRoot, stdio: "inherit" },
);

process.exit(result.status ?? 1);
