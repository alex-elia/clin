import { and, count, eq, gte, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  actionQueue,
  appSettings,
  contentPosts,
  outreachCampaignMembers,
} from "@/db/schema";
import { countContactsPendingLlmAnalysis } from "@/lib/autopilot";
import { countContactsNeedingProfileCapture } from "@/lib/enrichment";

export const REMINDER_KEYS = {
  lastDismissedDate: "reminder.last_dismissed_date",
} as const;

export type DailyReminderTaskId = "review_drafts" | "clean_contacts" | "post";

export type DailyReminderTask = {
  id: DailyReminderTaskId;
  label: string;
  count: number;
  href: string;
  lines: string[];
};

export type DailyReminderSummary = {
  tasks: DailyReminderTask[];
  totalCount: number;
  hasWork: boolean;
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function line(count: number, singular: string, plural: string): string | null {
  if (count <= 0) return null;
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

async function upsertSetting(key: string, value: string) {
  const db = getDb();
  const now = new Date();
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

export async function getDailyReminderSummary(): Promise<DailyReminderSummary> {
  const db = getDb();
  const now = new Date();
  const dayStart = startOfLocalDay(now);
  const dayEnd = endOfLocalDay(now);

  const [
    queueDecide,
    queueReady,
    queueReview,
    campaignReviewDraft,
    campaignExtensionReady,
    postsReview,
    postsReady,
    postsDueToday,
    needsProfile,
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(actionQueue)
      .where(
        and(
          eq(actionQueue.status, "pending"),
          eq(actionQueue.outreachDecision, "pending"),
        ),
      ),
    db
      .select({ n: count() })
      .from(actionQueue)
      .where(
        and(
          eq(actionQueue.status, "pending"),
          eq(actionQueue.outreachDecision, "approved"),
        ),
      ),
    db
      .select({ n: count() })
      .from(actionQueue)
      .where(
        and(
          eq(actionQueue.status, "pending"),
          ne(actionQueue.outreachDecision, "approved"),
        ),
      ),
    db
      .select({ n: count() })
      .from(outreachCampaignMembers)
      .where(
        and(
          sql`trim(coalesce(${outreachCampaignMembers.draftOutreach}, '')) != ''`,
          ne(outreachCampaignMembers.status, "ready"),
          inArray(outreachCampaignMembers.status, ["draft"]),
        ),
      ),
    db
      .select({ n: count() })
      .from(outreachCampaignMembers)
      .where(eq(outreachCampaignMembers.status, "ready")),
    db
      .select({ n: count() })
      .from(contentPosts)
      .where(
        and(ne(contentPosts.status, "archived"), eq(contentPosts.status, "review")),
      ),
    db
      .select({ n: count() })
      .from(contentPosts)
      .where(eq(contentPosts.status, "ready")),
    db
      .select({ n: count() })
      .from(contentPosts)
      .where(
        and(
          ne(contentPosts.status, "archived"),
          ne(contentPosts.status, "published"),
          isNotNull(contentPosts.scheduledAt),
          gte(contentPosts.scheduledAt, dayStart),
          lte(contentPosts.scheduledAt, dayEnd),
        ),
      ),
    countContactsNeedingProfileCapture(),
  ]);

  const pendingLlm = countContactsPendingLlmAnalysis();

  const outreachDecide = queueDecide[0]?.n ?? 0;
  const outreachReady = queueReady[0]?.n ?? 0;
  const queuePendingAll = queueReview[0]?.n ?? 0;
  const queueGeneralReview = Math.max(0, queuePendingAll - outreachDecide);
  const campaignDrafts = campaignReviewDraft[0]?.n ?? 0;
  const campaignReady = campaignExtensionReady[0]?.n ?? 0;
  const contentReview = postsReview[0]?.n ?? 0;
  const contentReady = postsReady[0]?.n ?? 0;
  const contentDueToday = postsDueToday[0]?.n ?? 0;

  const reviewDraftLines = [
    line(outreachDecide, "outreach message to approve", "outreach messages to approve"),
    line(campaignDrafts, "campaign draft to review", "campaign drafts to review"),
    line(contentReview, "post draft in review", "post drafts in review"),
  ].filter((s): s is string => s !== null);

  const reviewDraftCount = outreachDecide + campaignDrafts + contentReview;

  const cleanLines = [
    line(
      queueGeneralReview,
      "contact in review queue",
      "contacts in review queue",
    ),
    line(pendingLlm, "contact awaiting AI analysis", "contacts awaiting AI analysis"),
    line(needsProfile, "contact needs profile capture", "contacts need profile capture"),
  ].filter((s): s is string => s !== null);

  const cleanCount = queueGeneralReview + pendingLlm + needsProfile;

  const postLines = [
    line(contentReady, "post ready to publish", "posts ready to publish"),
    line(contentDueToday, "post scheduled for today", "posts scheduled for today"),
    line(outreachReady, "approved outreach ready to send", "approved outreach ready to send"),
    line(campaignReady, "campaign member ready in extension", "campaign members ready in extension"),
  ].filter((s): s is string => s !== null);

  const postCount =
    contentReady + contentDueToday + outreachReady + campaignReady;

  const tasks: DailyReminderTask[] = [];

  if (reviewDraftCount > 0) {
    const href =
      outreachDecide > 0 || campaignDrafts > 0
        ? "/decisions"
        : "/branding/calendar";
    tasks.push({
      id: "review_drafts",
      label: "Review drafts",
      count: reviewDraftCount,
      href,
      lines: reviewDraftLines,
    });
  }

  if (cleanCount > 0) {
    tasks.push({
      id: "clean_contacts",
      label: "Clean contacts",
      count: cleanCount,
      href: queueGeneralReview > 0 ? "/queue" : "/cleaning",
      lines: cleanLines,
    });
  }

  if (postCount > 0) {
    const href =
      contentReady > 0 || contentDueToday > 0
        ? "/branding/calendar"
        : "/decisions";
    tasks.push({
      id: "post",
      label: "Post & send",
      count: postCount,
      href,
      lines: postLines,
    });
  }

  const totalCount = reviewDraftCount + cleanCount + postCount;

  return {
    tasks,
    totalCount,
    hasWork: totalCount > 0,
  };
}

export async function shouldShowDailyReminder(): Promise<boolean> {
  const summary = await getDailyReminderSummary();
  if (!summary.hasWork) return false;

  const db = getDb();
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, REMINDER_KEYS.lastDismissedDate),
  });
  const dismissed = row?.value?.trim();
  return dismissed !== localDateKey();
}

export async function dismissDailyReminder(): Promise<void> {
  await upsertSetting(REMINDER_KEYS.lastDismissedDate, localDateKey());
}
