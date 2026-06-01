/**
 * Process due editorial_jobs. Run from clin/web: npm run branding:tick
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

async function main(): Promise<void> {
  execSync("node scripts/repair-clin-db.mjs", { cwd: webRoot, stdio: "inherit" });

  const { runEditorialJobTick } = await import(
    "../src/lib/editorial/editorialJobRunner"
  );
  const result = await runEditorialJobTick({ maxJobs: 10, enqueueDrafts: true });
  console.log(
    `[clin] branding:tick processed ${result.processed} job(s)`,
  );
  for (const r of result.results) {
    console.log(`  - ${r.type} (${r.ok ? "ok" : "fail"}): ${r.summary}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
