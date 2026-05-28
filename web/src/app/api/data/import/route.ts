import { NextResponse } from "next/server";
import { parseImportBundle, restoreFromBundle } from "@/lib/dataImport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("confirm") !== "REPLACE") {
    return NextResponse.json(
      {
        error:
          "Import requires confirm=REPLACE query param and a JSON export body.",
      },
      { status: 400 },
    );
  }
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  try {
    const bundle = parseImportBundle(raw);
    restoreFromBundle(bundle);
    return NextResponse.json({
      ok: true,
      exportedAt: bundle.exportedAt,
      tableCount: Object.keys(bundle.tables).length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
