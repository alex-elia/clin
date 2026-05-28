import fs from "node:fs";
import path from "node:path";

export function migrationsFolderFromCwd(cwd = process.cwd()) {
  const candidates = [
    path.join(cwd, "drizzle"),
    path.join(cwd, "web", "drizzle"),
  ];
  for (const mig of candidates) {
    if (fs.existsSync(path.join(mig, "meta", "_journal.json"))) return mig;
  }
  throw new Error(
    `[clin] Drizzle migrations not found under ${cwd} (tried drizzle/ and web/drizzle/)`,
  );
}

export function resolveClinDbPath(cwd = process.cwd()) {
  const env = process.env.CLIN_DB_PATH?.trim();
  if (env) {
    return path.isAbsolute(env) ? env : path.join(cwd, env);
  }
  const mig = migrationsFolderFromCwd(cwd);
  const configPath = path.join(path.dirname(mig), "data", "config.json");
  if (fs.existsSync(configPath)) {
    try {
      const { dbDirectory } = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (dbDirectory?.trim()) {
        return path.join(path.resolve(dbDirectory), "clin.db");
      }
    } catch {
      /* ignore */
    }
  }
  return path.join(path.dirname(mig), "data", "clin.db");
}
