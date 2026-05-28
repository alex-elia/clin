import { NextResponse } from "next/server";
import { getDataPathInfo, getLastBackupMeta } from "@/lib/dataPaths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [paths, backup] = await Promise.all([
    getDataPathInfo(),
    getLastBackupMeta(),
  ]);
  return NextResponse.json({ ...paths, lastBackup: backup });
}
