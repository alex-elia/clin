import fs from "node:fs";
import path from "node:path";

const BOOTSTRAP_CONFIG = "config.json";

export function migrationsFolderFromCwd(cwd = process.cwd()): string {
  const a = path.join(cwd, "drizzle");
  const b = path.join(cwd, "web", "drizzle");
  if (fs.existsSync(path.join(a, "meta", "_journal.json"))) return a;
  if (fs.existsSync(path.join(b, "meta", "_journal.json"))) return b;
  throw new Error(
    `[clin] Drizzle migrations not found (looked under ${a} and ${b}). cwd=${cwd}`,
  );
}

export function defaultDataDirectory(cwd = process.cwd()): string {
  const mig = migrationsFolderFromCwd(cwd);
  return path.join(path.dirname(mig), "data");
}

function bootstrapConfigPath(cwd = process.cwd()): string {
  return path.join(defaultDataDirectory(cwd), BOOTSTRAP_CONFIG);
}

function readBootstrapDbDirectory(cwd = process.cwd()): string | null {
  const file = bootstrapConfigPath(cwd);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      dbDirectory?: string;
    };
    const dir = raw.dbDirectory?.trim();
    return dir && dir.length > 0 ? dir : null;
  } catch {
    return null;
  }
}

export function writeBootstrapDbDirectory(
  directory: string,
  cwd = process.cwd(),
): void {
  const dir = path.resolve(directory);
  const dataDir = defaultDataDirectory(cwd);
  fs.mkdirSync(dataDir, { recursive: true });
  const file = bootstrapConfigPath(cwd);
  fs.writeFileSync(
    file,
    `${JSON.stringify({ dbDirectory: dir }, null, 2)}\n`,
    "utf8",
  );
}

export function resolveDataDirectory(cwd = process.cwd()): string {
  const env = process.env.CLIN_DB_PATH?.trim();
  if (env) {
    const file = path.isAbsolute(env) ? env : path.join(cwd, env);
    return path.dirname(path.resolve(file));
  }
  const bootstrap = readBootstrapDbDirectory(cwd);
  if (bootstrap) return path.resolve(bootstrap);
  return defaultDataDirectory(cwd);
}

export function resolveClinDbPath(cwd = process.cwd()): string {
  return path.join(resolveDataDirectory(cwd), "clin.db");
}
