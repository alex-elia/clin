import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "extension", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const version = manifest.version ?? "0.0.0";
const outDir = path.join(root, "dist", "desktop");
const outZip = path.join(outDir, `clin-capture-${version}.zip`);
const extensionDir = path.join(root, "extension");

fs.mkdirSync(outDir, { recursive: true });
if (fs.existsSync(outZip)) fs.unlinkSync(outZip);

// tar -a works on GitHub runners and modern Windows/macOS/Linux.
const result = spawnSync("tar", ["-a", "-c", "-f", outZip, "-C", extensionDir, "."], {
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`[desktop] Extension zip: ${outZip}`);
