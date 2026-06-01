import { getGlobalWriterInstructions } from "@/lib/brand";
import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";
import {
  buildPostCopyLanguageInstruction,
  parseContentLanguagePreference,
  postTextForLanguageDetection,
  resolveContentLanguage,
} from "@/lib/contentLanguage";
import { completeChat, getLlmConfig } from "@/lib/llm/completeChat";
import { getOrCreateUserContext } from "@/lib/userContext";
import {
  generateCopyRequestSchema,
  type CopyAudience,
  type CopyField,
  type GenerateCopyRequest,
} from "@/lib/copyAssistantShared";
import { LINKEDIN_POST_COPY_RULES } from "@/lib/linkedinPostClipboard";

export {
  generateCopyRequestSchema,
  COPY_AUDIENCE_LABELS,
  type CopyAudience,
  type CopyField,
  type GenerateCopyRequest,
} from "@/lib/copyAssistantShared";

const AUDIENCE_SYSTEM: Record<CopyAudience, string> = {
  b2b: `You are a senior B2B marketer and sales strategist (LinkedIn outreach context).
Write like a thoughtful account executive or founder selling to professionals: ICP clarity, one proof point, respectful tone, no spam or false familiarity.
Avoid hype, emojis unless the user asks, and claims you cannot support.`,
  b2c: `You are a B2C growth copywriter (LinkedIn context).
Write for individuals: lead with benefit or emotion, plain language, short sentences, one clear CTA.
Sound human, not corporate. No manipulative urgency or fake intimacy.`,
  growth: `You are a growth marketer who tests messaging (ethical, human-in-the-loop).
Write punchy, specific hooks with a single job-to-be-done per message. Favor curiosity and clarity over volume tricks.
Do not suggest automation abuse, ToS evasion, or deceptive personalization.`,
};

const FIELD_INSTRUCTIONS: Record<CopyField, string> = {
  campaign_name: `Output ONLY a short campaign name (max 8 words). No quotes, no explanation.`,
  campaign_context: `Output ONLY the campaign context block: what is offered, why now, who it helps, 1–2 proof points. Plain text, 80–400 words unless the user asks shorter. No JSON.`,
  campaign_writer: `Output ONLY writer instructions for an AI that drafts LinkedIn messages: tone, length cap, must-mention, avoid, CTA style. Bullet lines or short paragraphs. 40–250 words.`,
  global_writer: `Output ONLY global voice instructions reused across campaigns: tone, positioning, must-mention, avoid. 40–200 words.`,
  user_goals: `Output ONLY networking goals and constraints for the Clin user (bullet lines with "- " allowed). 80–350 words.`,
  user_positioning: `Output ONLY a positioning summary: who they are, who they help, proof, angle. Plain text or light bullets. 100–400 words.`,
  post_hook: `Output ONLY a LinkedIn post opening hook (1–3 sentences). Plain text only (no markdown). Punchy, concrete. No hashtags unless brief asks. Match the requested post language.`,
  post_body: `Output ONLY the LinkedIn post body (after the hook, do not repeat the hook). ${LINKEDIN_POST_COPY_RULES} Match the requested post language. Max ~2800 characters unless brief asks shorter.`,
  post_style_notes: `Output ONLY internal style notes for the writer (hashtags to use, structure, closing angle, things to avoid). Plain text. Not pasted to LinkedIn.`,
  post_article_body: `Output ONLY a long-form LinkedIn article draft (800–1200 words). Structured sections. Critical analysis allowed. Match the requested post language.`,
  content_doctrine: `Output ONLY a reusable personal content doctrine (5–7 numbered principles). Plain text bullets.`,
  expertise_summary: `Output ONLY a single-line expertise summary (max ~25 words) for a LinkedIn writing assistant. No quotes.`,
};

function stripFences(text: string): string {
  const fence = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  return text.trim();
}

function buildUserMessage(
  field: CopyField,
  audience: CopyAudience,
  prompt: string,
  ctx: GenerateCopyRequest["context"],
  extras: {
    globalWriter: string | null;
    goalsText: string | null;
    positioning: string | null;
  },
): string {
  let block = `Task field: ${field}\nAudience mode: ${audience.toUpperCase()}\nUser brief (follow this): ${prompt.trim()}\n\n`;

  if (ctx?.campaignName?.trim()) {
    block += `Campaign name (if relevant): ${ctx.campaignName.trim()}\n`;
  }
  if (ctx?.campaignContext?.trim()) {
    block += `Campaign context (if relevant):\n${ctx.campaignContext.trim()}\n\n`;
  }
  if (extras.globalWriter) {
    block += `Existing global voice (refine, do not contradict blindly):\n${extras.globalWriter}\n\n`;
  }
  if (extras.goalsText) {
    block += `User goals (context):\n${extras.goalsText}\n\n`;
  }
  if (extras.positioning) {
    block += `User positioning (context):\n${extras.positioning}\n\n`;
  }
  if (ctx?.goalsText?.trim()) {
    block += `Goals from form:\n${ctx.goalsText.trim()}\n\n`;
  }
  if (ctx?.positioningSummary?.trim()) {
    block += `Positioning from form:\n${ctx.positioningSummary.trim()}\n\n`;
  }
  if (ctx?.existingText?.trim()) {
    block += `Current draft in the form (improve or replace as the brief implies):\n${ctx.existingText.trim()}\n\n`;
  }

  block += FIELD_INSTRUCTIONS[field];
  return block;
}

export async function generateCopyFromBrief(
  body: GenerateCopyRequest,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const parsed = generateCopyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Invalid request." };
  }
  const { field, audience, prompt, context } = parsed.data;

  const llm = await getLlmConfig();
  const [globalWriter, userCtx, brand] = await Promise.all([
    getGlobalWriterInstructions(),
    getOrCreateUserContext(),
    getOrCreateContentBrandContext(),
  ]);

  const POST_COPY_FIELDS = new Set([
    "post_hook",
    "post_body",
    "post_style_notes",
    "post_article_body",
  ]);
  let languageLine = "";
  if (POST_COPY_FIELDS.has(field)) {
    const resolved = resolveContentLanguage({
      brandPreference: parseContentLanguagePreference(
        context?.contentLanguage ?? brand.contentLanguage,
      ),
      postLanguage: context?.postLanguage ?? null,
      postText: postTextForLanguageDetection({
        hook: context?.existingText,
      }),
      userMessage: prompt,
    });
    languageLine = `\n\n${buildPostCopyLanguageInstruction(resolved.language)}`;
  }

  const system = `${AUDIENCE_SYSTEM[audience]}${languageLine}\n\nYou output plain text only — no markdown fences, no preamble like "Here is".`;
  const user = buildUserMessage(field, audience, prompt, context, {
    globalWriter,
    goalsText: userCtx.goalsText,
    positioning: userCtx.positioningSummary,
  });

  try {
    let raw = await completeChat({
      config: llm,
      system,
      user,
      timeoutMs: 90_000,
      feature: "copy_assistant",
      meta: { field, audience },
    });
    raw = stripFences(raw);
    if (!raw) {
      return { ok: false, error: "Model returned empty text." };
    }
    if (field === "campaign_name") {
      raw = raw.split("\n")[0]?.trim() ?? raw;
      if (raw.length > 120) raw = raw.slice(0, 120).trim();
    }
    return { ok: true, text: raw };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `LLM failed: ${msg}. Check Settings → Inference.`,
    };
  }
}
