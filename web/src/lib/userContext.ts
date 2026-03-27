import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contacts, userContext } from "@/db/schema";

const DEFAULT_ID = "default";

export type UserContextRow = typeof userContext.$inferSelect;

export async function getOrCreateUserContext(): Promise<UserContextRow> {
  const db = getDb();
  const existing = await db.query.userContext.findFirst({
    where: eq(userContext.id, DEFAULT_ID),
  });
  if (existing) return existing;
  const now = new Date();
  await db.insert(userContext).values({
    id: DEFAULT_ID,
    updatedAt: now,
  });
  const row = await db.query.userContext.findFirst({
    where: eq(userContext.id, DEFAULT_ID),
  });
  if (!row) throw new Error("user_context insert failed");
  return row;
}

export type UserContextForLlm = {
  goalsText: string | null;
  positioningSummary: string | null;
  selfProfile: {
    fullName: string | null;
    headline: string | null;
    company: string | null;
    location: string | null;
  } | null;
};

export async function getUserContextForLlm(): Promise<UserContextForLlm> {
  const db = getDb();
  const row = await db.query.userContext.findFirst({
    where: eq(userContext.id, DEFAULT_ID),
  });
  if (!row) {
    return { goalsText: null, positioningSummary: null, selfProfile: null };
  }
  const goalsText = row.goalsText?.trim() || null;
  const positioningSummary = row.positioningSummary?.trim() || null;
  if (!row.selfContactId) {
    return { goalsText, positioningSummary, selfProfile: null };
  }
  const c = await db.query.contacts.findFirst({
    where: eq(contacts.id, row.selfContactId),
    columns: {
      fullName: true,
      headline: true,
      company: true,
      location: true,
    },
  });
  if (!c) {
    return { goalsText, positioningSummary, selfProfile: null };
  }
  return {
    goalsText,
    positioningSummary,
    selfProfile: {
      fullName: c.fullName,
      headline: c.headline,
      company: c.company,
      location: c.location,
    },
  };
}

export function userContextHasLlmSignal(ctx: UserContextForLlm): boolean {
  return Boolean(
    ctx.goalsText ||
      ctx.positioningSummary ||
      (ctx.selfProfile &&
        (ctx.selfProfile.headline?.trim() ||
          ctx.selfProfile.company?.trim() ||
          ctx.selfProfile.fullName?.trim())),
  );
}

export async function updateUserContext(patch: {
  selfContactId?: string | null;
  goalsText?: string | null;
  positioningSummary?: string | null;
  pendingSelfCaptureUrl?: string | null;
  pendingSelfCaptureAt?: Date | null;
}): Promise<void> {
  const db = getDb();
  await getOrCreateUserContext();
  const now = new Date();
  const updates: Partial<typeof userContext.$inferInsert> = { updatedAt: now };
  if ("selfContactId" in patch) updates.selfContactId = patch.selfContactId;
  if ("goalsText" in patch) updates.goalsText = patch.goalsText;
  if ("positioningSummary" in patch) {
    updates.positioningSummary = patch.positioningSummary;
  }
  if ("pendingSelfCaptureUrl" in patch) {
    updates.pendingSelfCaptureUrl = patch.pendingSelfCaptureUrl;
  }
  if ("pendingSelfCaptureAt" in patch) {
    updates.pendingSelfCaptureAt = patch.pendingSelfCaptureAt;
  }
  await db
    .update(userContext)
    .set(updates)
    .where(eq(userContext.id, DEFAULT_ID));
}
