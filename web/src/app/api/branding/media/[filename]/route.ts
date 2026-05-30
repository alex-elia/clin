import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { resolveDataDirectory } from "@/lib/dataPaths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mimeForFilename(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const forceDownload =
    new URL(req.url).searchParams.get("download") === "1";
  if (!filename || filename.includes("..") || filename.includes("/")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const filePath = path.join(
    resolveDataDirectory(),
    "media",
    "posts",
    filename,
  );
  try {
    const buf = await fs.readFile(filePath);
    const headers: Record<string, string> = {
      "Content-Type": mimeForFilename(filename),
      "Cache-Control": "private, max-age=3600",
    };
    if (forceDownload) {
      headers["Content-Disposition"] =
        `attachment; filename="${filename.replace(/"/g, "")}"`;
    }
    return new NextResponse(buf, { headers });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
