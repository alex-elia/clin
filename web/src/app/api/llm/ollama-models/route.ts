import { NextResponse } from "next/server";
import { listOllamaModels } from "@/lib/llm/completeChat";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("baseUrl")?.trim();
  const baseUrl = raw || "http://127.0.0.1:11434";
  const result = await listOllamaModels(baseUrl);
  return NextResponse.json(result);
}
