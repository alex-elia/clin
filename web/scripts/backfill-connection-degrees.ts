import { getDb } from "@/db";
import { backfillConnectionDegrees } from "@/lib/connectionDegreeBackfill";

async function main() {
  const db = getDb();
  const result = await backfillConnectionDegrees(db);
  console.log(
    `[clin] Connection degree backfill: scanned=${result.scanned} updated=${result.updated} already_ok=${result.alreadyOk} no_signal=${result.noSignal}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
