import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = path.join(root, ".next");
fs.rmSync(nextDir, { recursive: true, force: true });
console.log("[clin] Removed .next");
