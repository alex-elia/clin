import { completeChat, getLlmConfigForTier } from "@/lib/llm/completeChat";
import { appendLlmCallLog } from "@/lib/llm/llmCallLog";
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
  listContentPostsPipelineSummary,
  listRecentPublishedSummaries,
} from "@/lib/contentPosts";
import {
  coercePostCoachActions,
  summarizeCoachReplyForChat,
} from "@/lib/brandCoachClient";
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
  formatMarketCalendarBlock,
  loadMarketCalendarPack,
} from "@/lib/marketCalendar";
import { buildTrendInboxContextBlock } from "@/lib/sources/trendsContext";

import {
  COACH_ACTIONS_MARKER,
  parseCoachActionsFromLlm,
} from "@/lib/coachActionsParse";
import {
  COACH_LIMITS,
  budgetCoachUserBlock,
  coachHistoryLimit,
  draftTextLength,
  estimateOllamaNumCtx,
  trimCoachActionPatches,
  truncateForCoach,
  trimCoachDraft,
} from "@/lib/coachContextLimits";
import { routeBrandCoachModel } from "@/lib/llm/llmModelRoute";
import {
  LINKEDIN_MENTION_COACH_HINT,
  LINKEDIN_POST_COPY_RULES,
} from "@/lib/linkedinPostClipboard";

const SYSTEM_PROMPT_BASE = `You are the Brand Coach for Clin, a local-first LinkedIn personal branding assistant.

Your user is a B2B practitioner (IA en entreprise, transformation, souveraineté, FinOps). You help them WRITE POWERFUL POSTS FIRST:
- Turn raw brief/idea notes into a complete post: title, format, schedule, hook, body (closing invite and hashtags inside body when useful — no separate style sheet)
- ${LINKEDIN_POST_COPY_RULES}
- Do not repeat the hook at the start of body
- One-shot compose: prefer a single update_post action filling title, hook, body, format, scheduledAt, status=drafting when asked to write
- When update_post includes body or articleBody: keep prose reply SHORT (summary only). Put the full text ONLY in the JSON patch — never duplicate the full draft in prose and JSON.
- Never put the author's personal name as a signature at the end of hook/body
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

const HOME_COACH_INSTRUCTIONS = `Home coach (Clin command center):
- Help the user understand their network + content + outreach in plain language.
- You can plan LinkedIn posts (create_post, reschedule_pipeline) like studio when they ask.
- For network tasks (import list, analyze contacts, campaign autopilot): explain the Clin path with links — extension Import & enrich, /autopilot, /campaigns — you cannot capture LinkedIn from the server.
- Prefer short, actionable replies. Offer 1–3 concrete next steps.
- When they ask to "run" or "launch" content planning, use create_post actions with scheduledAt when possible.`;

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
  const scopeBlock =
    scope === "home"
      ? `\n\n${HOME_COACH_INSTRUCTIONS}\n\n${STUDIO_PLANNING_INSTRUCTIONS}`
      : scope === "studio"
        ? `\n\n${STUDIO_PLANNING_INSTRUCTIONS}`
        : "";
  return `${SYSTEM_PROMPT_BASE}${scopeBlock}

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
  const posts = await listContentPostsPipelineSummary(
    COACH_LIMITS.pipelinePosts,
  );
  if (!posts.length) return "Pipeline: (empty)";
  const lines = posts.map((p) => {
    const sched = p.scheduledAt
      ? new Date(p.scheduledAt).toISOString().slice(0, 16)
      : "unscheduled";
    const hook = p.hook?.slice(0, COACH_LIMITS.pipelineHook) ?? "";
    return `- id=${p.id} | ${p.status} | ${sched} | ${p.format} | ${p.title}${hook ? ` | hook: ${hook}` : ""}`;
  });
  return `Pipeline:\n${lines.join("\n")}`;
}

async function buildNetworkContext(): Promise<string> {
  const stats = await import("@/lib/queries").then((m) => m.getOverviewStats());
  const campaigns = await import("@/lib/outreachCampaigns").then((m) =>
    m.listOutreachCampaigns(),
  );
  const seg = stats.bySegment
    .map((s) => `${s.segment}: ${s.n}`)
    .join(", ");
  return `Network (local CRM):
contacts: ${stats.contacts}
capture events: ${stats.captures}
review queue pending: ${stats.queuePending}
segments: ${seg || "(none)"}
outreach campaigns: ${campaigns.length}`;
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
  | {
      ok: false;
      error: string;
      threadId?: string;
      debug?: import("@/lib/coachDebug").BrandCoachTurnDebug;
    }
> {
  const trimmed = truncateForCoach(
    input.message.trim(),
    COACH_LIMITS.userMessage,
  );
  if (trimmed.length < 2) {
    return { ok: false, error: "Message too short." };
  }

  const draft = input.draft ? trimCoachDraft({ ...input.draft }) : undefined;

  let llmBase;
  try {
    llmBase = await getLlmConfigForTier("orchestrator");
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "LLM not configured.",
    };
  }

  const scope: CoachThreadScope =
    input.scope ?? (input.postId ? "post" : "studio");

  let phase = "context";
  let createdThreadId: string | undefined;
  try {
  const [userCtx, brandCtx, globalWriter, pipeline, published, analytics] =
    await Promise.all([
      getOrCreateUserContext(),
      getOrCreateContentBrandContext(),
      getGlobalWriterInstructions(),
      buildPipelineContext(),
      listRecentPublishedSummaries(5),
      buildAnalyticsContext(),
    ]);

  let activePost: Awaited<ReturnType<typeof getContentPostById>> = null;
  if (input.postId) {
    activePost = await getContentPostById(input.postId);
  }

  const postText = postTextForLanguageDetection({
    title: draft?.title ?? activePost?.title,
    ideaNotes: draft?.ideaNotes ?? activePost?.ideaNotes,
    hook: draft?.hook ?? activePost?.hook,
    body: draft?.body ?? activePost?.body,
    articleBody: draft?.articleBody ?? activePost?.articleBody,
  });

  const draftLang = draft?.language ?? activePost?.language;
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
      draft?.language ??
      activePost.language ??
      resolvedLanguage.language;
    const format = draft?.format ?? activePost.format;
    const isArticle = format === "article";
    const ideaNotes = truncateForCoach(
      draft?.ideaNotes ?? activePost.ideaNotes,
      COACH_LIMITS.ideaNotes,
    );
    const hook = truncateForCoach(draft?.hook ?? activePost.hook, COACH_LIMITS.hook);
    const body = truncateForCoach(draft?.body ?? activePost.body, COACH_LIMITS.body);
    const articleBody = isArticle
      ? truncateForCoach(
          draft?.articleBody ?? activePost.articleBody,
          COACH_LIMITS.articleBody,
        )
      : "";
    postBlock = `Active post (id=${activePost.id}):
title: ${draft?.title ?? activePost.title}
status: ${activePost.status}
format: ${format}
language: ${lang ?? resolvedLanguage.language}
scheduledAt: ${activePost.scheduledAt?.toISOString() ?? "none"}
ideaNotes: ${ideaNotes}
hook: ${hook}
body: ${body}${isArticle ? `\narticleBody: ${articleBody}` : ""}
styleNotes: ${truncateForCoach(activePost.styleNotes, 1_500)}`;
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

  const horizon = brandCtx.planningHorizonDays ?? 14;
  const region = brandCtx.marketRegion ?? "fr";
  let planningExtras = "";
  if (scope === "studio" || scope === "home") {
    const pack = loadMarketCalendarPack(region);
    const calendarBlock = pack
      ? formatMarketCalendarBlock(pack, new Date(), horizon)
      : "";
    const trendBlock = await buildTrendInboxContextBlock(7, 10);
    planningExtras = `\n\n${calendarBlock}\n\n${trendBlock}\n\nPlanning horizon: ${horizon} days.`;
  }

  const networkBlock =
    scope === "home" ? `\n\n${await buildNetworkContext()}` : "";

  const contextBlock = `Author context:
goals: ${truncateForCoach(userCtx.goalsText, 2_000) || "(none)"}
positioning: ${truncateForCoach(userCtx.positioningSummary, 2_000) || "(none)"}
global_writer: ${truncateForCoach(globalWriter, 2_000) || "(none)"}
doctrine: ${truncateForCoach(brandCtx.contentDoctrine, 2_000) || "(none)"}
expertise: ${truncateForCoach(brandCtx.expertiseSummary, 2_000) || "(none)"}
stance: ${truncateForCoach(brandCtx.stanceNotes, 2_000) || "(none)"}
${brandCtx.mentionRoster?.trim() ? `${LINKEDIN_MENTION_COACH_HINT}${truncateForCoach(brandCtx.mentionRoster, 3_000)}` : "mention_roster: (none — add people/companies on /me)"}
content_language_default: ${brandCtx.contentLanguage ?? "auto"}
language_for_this_turn: ${resolvedLanguage.language} (${languageResolutionHint(resolvedLanguage)})
publishing_rhythm: ${rhythm}

Recently published:
${publishedLines || "(none)"}

${pipeline}

${analytics}
${networkBlock}
${planningExtras}

${postBlock}`;

  const { id: threadId } = await getOrCreateThread({
    threadId: input.threadId,
    scope,
    postId: input.postId ?? null,
    title:
      input.postId ? "Post coach" : scope === "home" ? "Home" : "Brand studio",
  });
  createdThreadId = threadId;

  const draftChars = draftTextLength({
    ideaNotes: (draft?.ideaNotes ?? activePost?.ideaNotes) ?? undefined,
    hook: (draft?.hook ?? activePost?.hook) ?? undefined,
    body: (draft?.body ?? activePost?.body) ?? undefined,
    articleBody: (draft?.articleBody ?? activePost?.articleBody) ?? undefined,
  });
  const historyLimit = coachHistoryLimit(draftChars);

  const history = await listThreadMessages(threadId, historyLimit);
  const historyLines: string[] = [];
  for (const m of history) {
    if (m.role === "user" || m.role === "assistant") {
      historyLines.push(
        `${m.role.toUpperCase()}: ${truncateForCoach(m.content, COACH_LIMITS.historyMessage)}`,
      );
    }
  }

  const {
    userBlock,
    historyDropped,
    contextTrimmed,
  } = budgetCoachUserBlock({
    contextBlock,
    historyLines,
    userMessage: trimmed,
  });

  if (userBlock.length > COACH_LIMITS.maxUserBlockChars) {
    return {
      ok: false,
      threadId,
      error:
        "This post has too much context for local AI. Shorten the draft, clear coach history, or switch to cloud LLM in Settings.",
      debug: {
        provider: llmBase.config.provider,
        model: llmBase.config.model,
        replyPreview: "",
        contextChars: userBlock.length,
        parse: {
          hasCoachActionsBlock: false,
          jsonExtracted: false,
          schemaValid: false,
          schemaError: null,
          actionsCount: 0,
          rawLength: 0,
          rawTailPreview: "",
        },
      },
    };
  }

  await appendThreadMessage(threadId, "user", trimmed);

  const modelRoute = routeBrandCoachModel({
    scope,
    message: trimmed,
    userBlockChars: userBlock.length,
    draftChars,
    format: draft?.format ?? activePost?.format,
    hasActivePost: Boolean(activePost),
  });
  const llmResolved = await getLlmConfigForTier(modelRoute.tier);
  const llm = llmResolved.config;

  phase = "llm";
  let raw: string;
  const systemPrompt = buildBrandCoachSystemPrompt(resolvedLanguage, scope);
  try {
    raw = await completeChat({
      config: llm,
      system: systemPrompt,
      user: userBlock,
      temperature: 0.55,
      feature: "brand_coach",
      numCtx:
        llm.provider === "ollama"
          ? estimateOllamaNumCtx(systemPrompt.length, userBlock.length)
          : undefined,
      meta: {
        threadId,
        postId: input.postId ?? null,
        scope,
        actionsMarker: COACH_ACTIONS_MARKER,
        historyDropped,
        contextTrimmed,
        modelTier: llmResolved.modelTier,
        modelRouteReason: modelRoute.reason,
        autoswitched: llmResolved.autoswitched,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "LLM request failed.";
    await appendLlmCallLog({
      feature: "brand_coach",
      provider: llm.provider,
      model: llm.model,
      durationMs: 0,
      ok: false,
      error: msg,
      systemChars: buildBrandCoachSystemPrompt(resolvedLanguage, scope).length,
      userChars: userBlock.length,
      responseChars: 0,
      responseText: msg,
      meta: { phase, threadId, postId: input.postId ?? null, scope },
    });
    return {
      ok: false,
      threadId,
      error: msg,
      debug: {
        provider: llm.provider,
        model: llm.model,
        replyPreview: "",
        contextChars: userBlock.length,
        parse: {
          hasCoachActionsBlock: false,
          jsonExtracted: false,
          schemaValid: false,
          schemaError: null,
          actionsCount: 0,
          rawLength: 0,
          rawTailPreview: "",
        },
      },
    };
  }

  const { reply, actions: parsedActions, parse } = parseCoachActionsFromLlm(raw);
  const actions = trimCoachActionPatches(
    coercePostCoachActions(parsedActions, input.postId),
  );
  await appendThreadMessage(threadId, "assistant", reply, actions);

  const clientReply = summarizeCoachReplyForChat(reply, actions);

  const debug: import("@/lib/coachDebug").BrandCoachTurnDebug = {
    provider: llm.provider,
    model: llm.model,
    modelTier: llmResolved.modelTier,
    modelRouteReason: modelRoute.reason,
    autoswitched: llmResolved.autoswitched,
    replyPreview: clientReply.slice(0, 600),
    contextChars: userBlock.length,
    parse: { ...parse, actionsCount: actions.length },
  };

  return {
    ok: true,
    threadId,
    reply: clientReply,
    actions,
    resolvedLanguage,
    debug,
  };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Coach turn failed.";
    const errLlm = llmBase.config;
    await appendLlmCallLog({
      feature: "brand_coach",
      provider: errLlm.provider,
      model: errLlm.model,
      durationMs: 0,
      ok: false,
      error: `${phase}: ${msg}`,
      systemChars: 0,
      userChars: 0,
      responseChars: 0,
      responseText: msg,
      meta: { phase, postId: input.postId ?? null },
    }).catch(() => undefined);
    return {
      ok: false,
      threadId: createdThreadId,
      error: msg,
      debug: {
        provider: errLlm.provider,
        model: errLlm.model,
        replyPreview: "",
        parse: {
          hasCoachActionsBlock: false,
          jsonExtracted: false,
          schemaValid: false,
          schemaError: null,
          actionsCount: 0,
          rawLength: 0,
          rawTailPreview: "",
        },
      },
    };
  }
}
