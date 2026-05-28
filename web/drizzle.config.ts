import { defineConfig } from "drizzle-kit";
import path from "node:path";
import fs from "node:fs";

function resolveDbPathForKit(): string {
  const env = process.env.CLIN_DB_PATH?.trim();
  if (env) {
    return path.isAbsolute(env) ? env : path.join(__dirname, env);
  }
  const configPath = path.join(__dirname, "data", "config.json");
  if (fs.existsSync(configPath)) {
    try {
      const { dbDirectory } = JSON.parse(
        fs.readFileSync(configPath, "utf8"),
      ) as { dbDirectory?: string };
      if (dbDirectory?.trim()) {
        return path.join(path.resolve(dbDirectory), "clin.db");
      }
    } catch {
      /* ignore */
    }
  }
  return path.join(__dirname, "data", "clin.db");
}

const dbPath = resolveDbPathForKit();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: dbPath },
});
