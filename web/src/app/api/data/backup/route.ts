import { NextResponse } from "next/server";
import { backupAndRecord } from "@/lib/dataBackup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await backupAndRecord();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Backup failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
