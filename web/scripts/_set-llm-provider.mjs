import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
}

const base =
  process.env.OVH_AI_UNIFIED_MODEL_URL?.trim()?.replace(/\/$/, "") ||
  process.env.LLM_BASE_URL?.trim()?.replace(/\/$/, "") ||
  "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1";
const model =
  process.env.LLM_MODEL?.trim() ||
  process.env.OVH_AI_ORCHESTRATOR_MODEL?.trim() ||
  "Mistral-Small-3.2-24B-Instruct-2506";

const db = new Database(path.join(root, "data", "clin.db"));
const now = new Date().toISOString();
const upsert = db.prepare(
  "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
);
upsert.run("llm.provider", "openai_compatible", now);
upsert.run("llm.cloud.base_url", base, now);
upsert.run("llm.cloud.model", model, now);
for (const key of ["llm.base_url", "llm.model", "ollama.base_url", "ollama.model"]) {
  db.prepare("DELETE FROM app_settings WHERE key = ?").run(key);
}
console.log("[clin] llm.provider=openai_compatible", base, model);
db.close();
