import { listPostAnalyticsSnapshots, summarizeMetricsAcrossSnapshots } from "@/lib/accountAnalytics";
import { listContentPosts } from "@/lib/contentPosts";
import { getOverviewStats } from "@/lib/queries";
import { listOutreachCampaigns } from "@/lib/outreachCampaigns";
import { getVoiceSetupStatus } from "@/lib/voiceSetup";
import type { ContentPostStatus } from "@/lib/contentPostsShared";

export type HomeDashboardData = {
  network: {
    contacts: number;
    captures: number;
    queuePending: number;
    bySegment: { segment: string; n: number }[];
  };
  branding: {
    voiceSetupComplete: boolean;
    postsByStatus: Record<ContentPostStatus, number>;
    scheduledNext14Days: number;
    publishedLast30Days: number;
    readyToPublish: number;
  };
  outreach: {
    campaigns: number;
  };
  analytics: {
    hasSnapshots: boolean;
    metrics: { label: string; value: string }[];
  };
};

export async function getHomeDashboardData(): Promise<HomeDashboardData> {
  const now = new Date();
  const in14 = new Date(now);
  in14.setDate(in14.getDate() + 14);
  const ago30 = new Date(now);
  ago30.setDate(ago30.getDate() - 30);

  const [overview, posts, campaigns, voice, snapshots] = await Promise.all([
    getOverviewStats(),
    listContentPosts({ limit: 300, excludeArchived: true }),
    listOutreachCampaigns(),
    getVoiceSetupStatus(),
    listPostAnalyticsSnapshots(3),
  ]);

  const postsByStatus: Record<ContentPostStatus, number> = {
    idea: 0,
    drafting: 0,
    review: 0,
    ready: 0,
    published: 0,
    archived: 0,
  };
  let scheduledNext14Days = 0;
  let publishedLast30Days = 0;
  let readyToPublish = 0;

  for (const p of posts) {
    const st = p.status as ContentPostStatus;
    if (st in postsByStatus) postsByStatus[st] += 1;
    if (p.status === "ready") readyToPublish += 1;
    if (p.scheduledAt && p.scheduledAt >= now && p.scheduledAt <= in14) {
      scheduledNext14Days += 1;
    }
    if (
      p.status === "published" &&
      p.publishedAt &&
      p.publishedAt >= ago30
    ) {
      publishedLast30Days += 1;
    }
  }

  const summary = summarizeMetricsAcrossSnapshots(snapshots);
  const metrics = summary.slice(0, 4).map((m) => ({
    label: m.label,
    value: m.value,
  }));

  return {
    network: {
      contacts: overview.contacts,
      captures: overview.captures,
      queuePending: overview.queuePending,
      bySegment: overview.bySegment,
    },
    branding: {
      voiceSetupComplete: voice.complete,
      postsByStatus,
      scheduledNext14Days,
      publishedLast30Days,
      readyToPublish,
    },
    outreach: {
      campaigns: campaigns.length,
    },
    analytics: {
      hasSnapshots: snapshots.length > 0,
      metrics,
    },
  };
}
