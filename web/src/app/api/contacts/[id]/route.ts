import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import { isCleaningBucket } from "@/lib/cleaningBuckets";
import {
  selectContactLlmExtension,
  tryUpdateLlmMessageContext,
} from "@/lib/contactSqlExtras";
import {
  tryUpdateCleaningDismissedAt,
  tryUpdateCleaningUserBucket,
} from "@/lib/cleaningSqlExtras";
import { SCORE_RULE_VERSION, scoreContact } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const db = getDb();
  const row = await db.query.contacts.findFirst({ where: eq(contacts.id, id) });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const llm = selectContactLlmExtension(id);
  return NextResponse.json({ ...row, ...(llm ?? {}) });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const patch: Partial<{
    fullName: string;
    headline: string;
    company: string;
    location: string;
    segment: string;
    llmMessageContext: string | null;
  }> = {};

  if (typeof b.fullName === "string") patch.fullName = b.fullName;
  if (typeof b.headline === "string") patch.headline = b.headline;
  if (typeof b.company === "string") patch.company = b.company;
  if (typeof b.location === "string") patch.location = b.location;
  if (typeof b.segment === "string") patch.segment = b.segment;
  if (typeof b.llm_message_context === "string") {
    patch.llmMessageContext = b.llm_message_context;
  }
  if (b.llm_message_context === null) {
    patch.llmMessageContext = null;
  }

  if (b.cleaning_user_bucket === null) {
    tryUpdateCleaningUserBucket(id, null);
  } else if (
    typeof b.cleaning_user_bucket === "string" &&
    isCleaningBucket(b.cleaning_user_bucket)
  ) {
    tryUpdateCleaningUserBucket(id, b.cleaning_user_bucket);
  }

  if (b.cleaning_dismissed === true) {
    tryUpdateCleaningDismissedAt(id, true);
  } else if (b.cleaning_dismissed === false) {
    tryUpdateCleaningDismissedAt(id, false);
  }

  const db = getDb();
  const row = await db.query.contacts.findFirst({ where: eq(contacts.id, id) });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const next = { ...row, ...patch, lastUpdatedAt: new Date() };
  const scores = scoreContact(next);

  const { llmMessageContext, ...restPatch } = patch;
  if (llmMessageContext !== undefined) {
    tryUpdateLlmMessageContext(id, llmMessageContext);
  }

  await db
    .update(contacts)
    .set({
      ...restPatch,
      segment: scores.segment,
      relationshipScore: scores.relationshipScore,
      businessScore: scores.businessScore,
      cleanupScore: scores.cleanupScore,
      relationshipReasons: JSON.stringify(scores.relationshipReasons),
      businessReasons: JSON.stringify(scores.businessReasons),
      cleanupReasons: JSON.stringify(scores.cleanupReasons),
      scoreRuleVersion: SCORE_RULE_VERSION,
      lastUpdatedAt: new Date(),
    })
    .where(eq(contacts.id, id));

  const updated = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
  });
  const llm = selectContactLlmExtension(id);

  return NextResponse.json(
    updated ? { ...updated, ...(llm ?? {}) } : updated,
  );
}
