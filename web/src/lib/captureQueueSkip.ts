import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";

function skipKey(campaignId: string): string {
  return `extension.capture_queue_skip:${campaignId}`;
}

export async function getCaptureQueueSkipMemberIds(
  campaignId: string,
): Promise<Set<string>> {
  const db = getDb();
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, skipKey(campaignId)),
  });
  if (!row?.value?.trim()) return new Set();
  try {
    const parsed = JSON.parse(row.value) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id) => typeof id === "string" && id.trim()));
  } catch {
    return new Set();
  }
}

async function persistSkipMemberIds(
  campaignId: string,
  memberIds: Set<string>,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  const key = skipKey(campaignId);
  const value = JSON.stringify([...memberIds]);
  const existing = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, key),
  });
  if (existing) {
    await db
      .update(appSettings)
      .set({ value, updatedAt: now })
      .where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value, updatedAt: now });
  }
}

export async function skipCaptureQueueMember(
  campaignId: string,
  memberId: string,
): Promise<{ skippedCount: number }> {
  const ids = await getCaptureQueueSkipMemberIds(campaignId);
  ids.add(memberId.trim());
  await persistSkipMemberIds(campaignId, ids);
  return { skippedCount: ids.size };
}

export async function clearCaptureQueueSkips(
  campaignId: string,
): Promise<void> {
  const db = getDb();
  await db.delete(appSettings).where(eq(appSettings.key, skipKey(campaignId)));
}
