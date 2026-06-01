import { completeChat, getLlmConfig } from "@/lib/llm/completeChat";
import { listPostAnalyticsSnapshots } from "@/lib/accountAnalytics";
import { getGlobalWriterInstructions } from "@/lib/brand";
import {
  appendThreadMessage,
  getOrCreateThread,
  listThreadMessages,
  type CoachThreadScope,
} from "@/lib/contentCoachThreads";
import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";
import {
  getContentPostById,
  listContentPosts,
  listRecentPublished,
} from "@/lib/contentPosts";
import type { CoachAction } from "@/lib/brandCoachTypes";
import {
  buildCoachLanguageInstruction,
  languageResolutionHint,
  parseContentLanguagePreference,
  postTextForLanguageDetection,
  resolveContentLanguage,
  type ResolvedLanguage,
} from "@/lib/contentLanguage";
import { getOrCreateUserContext } from "@/lib/userContext";

import {
  COACH_ACTIONS_MARKER,
  parseCoachActionsFromLlm,
} from "@/lib/coachActionsParse";
import { LINKEDIN_POST_COPY_RULES } from "@/lib/linkedinPostClipboard";

const SYSTEM_PROMPT_BASE = `You are the Brand Coach for Clin, a local-first LinkedIn personal branding assistant.

Your user is a B2B practitioner (IA en entreprise, transformation, souveraineté, FinOps). You help them WRITE POWERFUL POSTS FIRST:
- Turn raw brief/idea notes into a complete post: title, format, schedule, hook, body (closing invite and hashtags inside body when useful — no separate style sheet)
- ${LINKEDIN_POST_COPY_RULES}
- Do not repeat the hook at the start of body
- One-shot compose: prefer a single update_post action filling title, hook, body, format, scheduledAt, status=drafting when asked to write
- Plan editorial calendar when asked (spacing, Tue/Thu morning slots when rhythm says so)
- Coach on risks (e.g. avoid fake attributed quotes; prefer real citations + their twist)
- Use concrete hooks when they share quotes they heard in the field
- Q&A: answer clearly, then offer to apply fields via actions
- Recommend feed posts for reach; article + short teaser for deep critical analysis

You NEVER claim to post on LinkedIn. The user copies and publishes manually.

When you want to change data, append a JSON block at the very end:

\`\`\`coach-actions
{"actions":[...]}
\`\`\`

Allowed action types:
- update_post: { type, postId, patch: { title?, status?, format?, ideaNotes?, hook?, body?, articleBody?, styleNotes?, scheduledAt? (ISO), coachFlags?, lastCoachSummary? } }
- create_post: { type, post: { title, status?, format?, ideaNotes?, hook?, body?, scheduledAt? } }
- reschedule_pipeline: { type, items: [{ postId, scheduledAt?, title? }] }
- mark_published: { type, postId? OR titleMatch? }
- suggest_doctrine: { type, contentDoctrine }

Use postIds from the pipeline context.`;

const STUDIO_PLANNING_INSTRUCTIONS = `Planning chat (studio scope — no single active post):
- When the user asks what to publish this week/month, or to plan the calendar: propose concrete ideas AND add them with create_post actions (title, ideaNotes with angle + key points, scheduledAt on Tue/Thu mornings per publishing_rhythm unless they specify otherwise). Use status "idea" or "drafting".
- Do NOT return {"actions":[]} after listing ideas they asked to plan — either create_post for each slot or ask ONE clarifying question without an empty actions block.
- reschedule_pipeline when they ask to move existing posts; use postIds from the pipeline.
- Market / country context: when they mention France, EU, US, etc., factor in holidays and quiet periods (e.g. August in France, early May, year-end) and say so briefly in the reply.
- Advisory-only turn (user still choosing): reply in prose, omit the coach-actions block entirely — do not send an empty actions array.
- Full hook/body writing happens on each post page; here you plan titles, briefs, and schedule only.`;

function buildBrandCoachSystemPrompt(
  resolved: ResolvedLanguage,
  scope: CoachThreadScope,
): string {
  const studioBlock =
    scope === "studio" ? `\n\n${STUDIO_PLANNING_INSTRUCTIONS}` : "";
  return `${SYSTEM_PROMPT_BASE}${studioBlock}

${buildCoachLanguageInstruction(resolved.language)}`;
}

export type BrandCoachDraft = {
  title?: string;
  format?: string;
  ideaNotes?: string;
  hook?: string;
  body?: string;
  articleBody?: string;
  language?: string;
};

async function buildPipelineContext(): Promise<string> {
  const posts = await listContentPosts({ limit: 80 });
  if (!posts.length) return "Pipeline: (empty)";
  const lines = posts.map((p) => {
    const sched = p.scheduledAt
      ? new Date(p.scheduledAt).toISOString().slice(0, 16)
      : "unscheduled";
    const hook = p.hook?.slice(0, 80) ?? "";
    return `- id=${p.id} | ${p.status} | ${sched} | ${p.format} | ${p.title}${hook ? ` | hook: ${hook}` : ""}`;
  });
  return `Pipeline:\n${lines.join("\n")}`;
}

async function buildAnalyticsContext(): Promise<string> {
  const snaps = await listPostAnalyticsSnapshots(1);
  const top = snaps[0]?.topPosts?.slice(0, 3) ?? [];
  if (!top.length) return "";
  const lines = top.map(
    (t, i) =>
      `${i + 1}. "${t.excerpt.slice(0, 120)}" reactions=${t.reactions ?? "?"}`,
  );
  return `Recent top posts (analytics):\n${lines.join("\n")}`;
}

export async function runBrandCoachTurn(input: {
  message: string;
  threadId?: string;
  postId?: string;
  scope?: CoachThreadScope;
  draft?: BrandCoachDraft;
}): Promise<
  | {
      ok: true;
      threadId: string;
      reply: string;
      actions: CoachAction[];
      resolvedLanguage: ResolvedLanguage;
      debug: import("@/lib/coachDebug").BrandCoachTurnDebug;
    }
  | { ok: false; error: string; debug?: import("@/lib/coachDebug").BrandCoachTurnDebug }
> {
  const trimmed = input.message.trim();
  if (trimmed.length < 2) {
    return { ok: false, error: "Message too short." };
  }

  const scope: CoachThreadScope =
    input.scope ?? (input.postId ? "post" : "studio");

  const [userCtx, brandCtx, globalWriter, pipeline, published, analytics] =
    await Promise.all([
      getOrCreateUserContext(),
      getOrCreateContentBrandContext(),
      getGlobalWriterInstructions(),
      buildPipelineContext(),
      listRecentPublished(5),
      buildAnalyticsContext(),
    ]);

  let activePost: Awaited<ReturnType<typeof getContentPostById>> = null;
  if (input.postId) {
    activePost = await getContentPostById(input.postId);
  }

  const postText = postTextForLanguageDetection({
    title: input.draft?.title ?? activePost?.title,
    ideaNotes: input.draft?.ideaNotes ?? activePost?.ideaNotes,
    hook: input.draft?.hook ?? activePost?.hook,
    body: input.draft?.body ?? activePost?.body,
    articleBody: input.draft?.articleBody ?? activePost?.articleBody,
  });

  const draftLang = input.draft?.language ?? activePost?.language;
  const postLangOverride =
    draftLang === "fr" || draftLang === "en" ? draftLang : null;

  const resolvedLanguage = resolveContentLanguage({
    brandPreference: parseContentLanguagePreference(
      brandCtx.contentLanguage,
    ),
    postLanguage: postLangOverride,
    postText,
    // Autopilot sends an English system prompt — detect from brief/post only
    userMessage: trimmed,
  });

  let postBlock = "";
  if (activePost) {
    const lang =
      postLangOverride ??
      input.draft?.language ??
      activePost.language ??
      resolvedLanguage.language;
    postBlock = `Active post (id=${activePost.id}):
title: ${input.draft?.title ?? activePost.title}
status: ${activePost.status}
format: ${input.draft?.format ?? activePost.format}
language: ${lang ?? resolvedLanguage.language}
scheduledAt: ${activePost.scheduledAt?.toISOString() ?? "none"}
ideaNotes: ${input.draft?.ideaNotes ?? activePost.ideaNotes ?? ""}
hook: ${input.draft?.hook ?? activePost.hook ?? ""}
body: ${input.draft?.body ?? activePost.body ?? ""}
articleBody: ${input.draft?.articleBody ?? activePost.articleBody ?? ""}
styleNotes: ${activePost.styleNotes ?? ""}`;
  }

  const publishedLines = published
    .map(
      (p) =>
        `- ${p.title} (${p.publishedAt ? new Date(p.publishedAt).toISOString().slice(0, 10) : "?"})`,
    )
    .join("\n");

  const rhythm = brandCtx.publishingRhythm
    ? JSON.stringify(brandCtx.publishingRhythm)
    : "not set";

  const contextBlock = `Author context:
goals: ${userCtx.goalsText ?? "(none)"}
positioning: ${userCtx.positioningSummary ?? "(none)"}
global_writer: ${globalWriter ?? "(none)"}
doctrine: ${brandCtx.contentDoctrine ?? "(none)"}
expertise: ${brandCtx.expertiseSummary ?? "(none)"}
stance: ${brandCtx.stanceNotes ?? "(none)"}
content_language_default: ${brandCtx.contentLanguage ?? "auto"}
language_for_this_turn: ${resolvedLanguage.language} (${languageResolutionHint(resolvedLanguage)})
publishing_rhythm: ${rhythm}

Recently published:
${publishedLines || "(none)"}

${pipeline}

${analytics}

${postBlock}`;

  const { id: threadId } = await getOrCreateThread({
    threadId: input.threadId,
    scope,
    postId: input.postId ?? null,
    title: input.postId ? "Post coach" : "Brand studio",
  });

  const history = await listThreadMessages(threadId, 30);
  const historyLines: string[] = [];
  for (const m of history) {
    if (m.role === "user" || m.role === "assistant") {
      historyLines.push(`${m.role.toUpperCase()}: ${m.content}`);
    }
  }

  const userBlock = `Context snapshot:\n${contextBlock}

Conversation so far:
${historyLines.length ? historyLines.join("\n\n") : "(new thread)"}

USER: ${trimmed}`;

  await appendThreadMessage(threadId, "user", trimmed);

  let llm;
  try {
    llm = await getLlmConfig();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "LLM not configured.",
    };
  }

  let raw: string;
  try {
    raw = await completeChat({
      config: llm,
      system: buildBrandCoachSystemPrompt(resolvedLanguage, scope),
      user: userBlock,
      temperature: 0.55,
      feature: "brand_coach",
      meta: {
        threadId,
        postId: input.postId ?? null,
        scope,
        actionsMarker: COACH_ACTIONS_MARKER,
      },
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "LLM request failed.",
    };
  }

  const { reply, actions, parse } = parseCoachActionsFromLlm(raw);
  await appendThreadMessage(threadId, "assistant", reply, actions);

  const debug: import("@/lib/coachDebug").BrandCoachTurnDebug = {
    provider: llm.provider,
    model: llm.model,
    replyPreview: reply.slice(0, 600),
    parse,
  };

  return { ok: true, threadId, reply, actions, resolvedLanguage, debug };
}
