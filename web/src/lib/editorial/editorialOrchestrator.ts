import { applyCoachActions } from "@/lib/brandCoachApply";
import { runBrandCoachTurn } from "@/lib/brandCoach";
import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";
import { enforceMaxPostsPerWeek } from "@/lib/editorial/enforceMaxPosts";
import { runPostAutopilotServer } from "@/lib/editorial/editorialAutopilot";
import type { EditorialJobRow } from "@/lib/editorial/editorialJobs";
import { ingestContentSources } from "@/lib/sources/ingest";
import {
  formatMarketCalendarBlock,
  loadMarketCalendarPack,
} from "@/lib/marketCalendar";
import { buildTrendInboxContextBlock } from "@/lib/sources/trendsContext";
import { listContentPosts } from "@/lib/contentPosts";

export type JobRunResult = {
  ok: boolean;
  summary: string;
};

export async function runEditorialJob(
  job: EditorialJobRow,
): Promise<JobRunResult> {
  switch (job.type) {
    case "ingest_sources": {
      const r = await ingestContentSources({ mode: "sources" });
      return {
        ok: r.errors.length === 0,
        summary: `Ingested ${r.itemsStored} items from ${r.sourcesProcessed} sources.`,
      };
    }
    case "ingest_trends": {
      const r = await ingestContentSources({ mode: "trends" });
      return {
        ok: r.errors.length === 0,
        summary: `Trends: ${r.itemsStored} items (${r.tavilyCreditsUsed} Tavily credits).`,
      };
    }
    case "plan_horizon": {
      const brand = await getOrCreateContentBrandContext();
      const horizon = brand.planningHorizonDays ?? 14;
      const region = brand.marketRegion ?? "fr";
      const pack = loadMarketCalendarPack(region);
      const calendarBlock = pack
        ? formatMarketCalendarBlock(pack, new Date(), horizon)
        : "";
      const trendBlock = await buildTrendInboxContextBlock(7, 10);
      const posts = await listContentPosts({ limit: 40 });
      const pipeline = posts
        .map((p) => `- ${p.id} | ${p.status} | ${p.title}`)
        .join("\n");
      const message = `Plan the next ${horizon} days of LinkedIn posts.

${calendarBlock}

${trendBlock}

Current pipeline:
${pipeline || "(empty)"}

Add concrete calendar slots with create_post actions (title, ideaNotes with angle, scheduledAt on preferred weekdays). Respect maxPostsPerWeek from publishing rhythm.`;

      const turn = await runBrandCoachTurn({
        message,
        scope: "studio",
      });
      if (!turn.ok) {
        return { ok: false, summary: turn.error };
      }
      const apply = await applyCoachActions(turn.actions);
      const trimmed = await enforceMaxPostsPerWeek(
        apply.createdPostIds,
        brand.publishingRhythm,
      );
      return {
        ok: apply.errors.length === 0,
        summary: `Planned ${apply.createdPostIds.length} posts (applied ${apply.applied}, trimmed ${trimmed}).`,
      };
    }
    case "draft_post": {
      if (!job.postId) {
        return { ok: false, summary: "draft_post missing postId." };
      }
      const brand = await getOrCreateContentBrandContext();
      const policy = brand.editorialAutopilotPolicy ?? {};
      const result = await runPostAutopilotServer(job.postId, {
        includeImage: policy.includeImage,
      });
      if (!result.ok) {
        return { ok: false, summary: result.error };
      }
      return {
        ok: true,
        summary: `Drafted post (applied ${result.applied}, image ${result.imageGenerated}).`,
      };
    }
    case "review_digest": {
      const due = await listContentPosts({
        statuses: ["review", "drafting"],
        limit: 10,
      });
      return {
        ok: true,
        summary: `${due.length} post(s) awaiting review.`,
      };
    }
    default:
      return { ok: false, summary: `Unknown job type: ${job.type}` };
  }
}
