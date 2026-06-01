"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import { ensureContactStubFromProfileUrl } from "@/lib/ingest";
import {
  updateAutomationSettings,
  type AutomationSettingsPatch,
} from "@/lib/automation";
import { getLlmConfig, updateLlmConfig } from "@/lib/llm/completeChat";
import { updatePaceSettings } from "@/lib/pace";
import { SCORE_RULE_VERSION, scoreContact } from "@/lib/scoring";
import { runSelfGoalsAndPositioningLlm } from "@/lib/userProfileLlm";
import { runVoiceSetupFromProfileLlm } from "@/lib/voiceSetupLlm";
import { updateAutopilotSettings } from "@/lib/autopilot";
import { setGlobalWriterInstructions } from "@/lib/brand";
import { backupAndRecord } from "@/lib/dataBackup";
import { setStoredDbDirectory } from "@/lib/dataPaths";
import {
  updateOutreachSendSettings,
  type OutreachSendSettingsPatch,
} from "@/lib/outreachSend";
import { generateOutreachDraftForMember } from "@/lib/outreachCampaignDraft";
import {
  addContactsFromSegment,
  addContactsToCampaign,
  createOutreachCampaign,
  findMemberById,
  listMembersNeedingDraft,
  removeMemberFromCampaign,
  setActiveOutreachCampaignId,
  setCaptureTargetCampaignId,
  updateMemberDraft,
  updateMemberStatus,
  updateOutreachCampaign,
} from "@/lib/outreachCampaigns";
import { updateUserContext } from "@/lib/userContext";
import {
  upsertInboxThreadState,
  type InboxThreadStatus,
} from "@/lib/inbox";

export async function recomputeAllScores() {
  const db = getDb();
  const all = await db.select().from(contacts);
  for (const row of all) {
    const scores = scoreContact(row);
    await db
      .update(contacts)
      .set({
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
      .where(eq(contacts.id, row.id));
  }
  revalidatePath("/");
  revalidatePath("/contacts");
  revalidatePath("/queue");
}

export async function savePaceForm(formData: FormData) {
  const readInt = (key: string) => {
    const raw = formData.get(key);
    if (typeof raw !== "string" || raw.trim() === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  await updatePaceSettings({
    queueBatchSize: readInt("queueBatchSize"),
    minSecondsBetweenProfileOpens: readInt("minSecondsBetweenProfileOpens"),
    minSecondsBetweenCaptures: readInt("minSecondsBetweenCaptures"),
    captureMaxPerHour: readInt("captureMaxPerHour"),
    paceJitterPercent: readInt("paceJitterPercent"),
  });
  revalidatePath("/settings");
  revalidatePath("/queue");
}

export async function saveAutomationForm(formData: FormData) {
  const readInt = (key: string) => {
    const raw = formData.get(key);
    if (typeof raw !== "string" || raw.trim() === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const patch: AutomationSettingsPatch = {
    enabled: formData.get("automationEnabled") === "on",
    connectionsSprintEnabled:
      formData.get("automationConnectionsSprintEnabled") === "on",
    autoEnrichAfterList:
      formData.get("automationAutoEnrichAfterList") === "on",
    autoCaptureMessagingInEnrich:
      formData.get("automationAutoCaptureMessaging") === "on",
    maxPerDay: readInt("automationMaxPerDay"),
    minGapSeconds: readInt("automationMinGapSeconds"),
    maxGapSeconds: readInt("automationMaxGapSeconds"),
    jitterPercent: readInt("automationJitterPercent"),
  };
  await updateAutomationSettings(patch);
  revalidatePath("/settings");
}

function readFormString(formData: FormData, name: string): string | undefined {
  const raw = formData.get(name);
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  return raw.trim();
}

export async function saveLlmForm(formData: FormData) {
  const providerRaw = formData.get("llmProvider");
  const provider =
    providerRaw === "openai_compatible" ? "openai_compatible" : "ollama";

  const patch: Parameters<typeof updateLlmConfig>[0] = {
    provider,
    ollamaBaseUrl: readFormString(formData, "ollamaBaseUrl"),
    ollamaModel: readFormString(formData, "ollamaModel"),
    cloudBaseUrl: readFormString(formData, "cloudBaseUrl"),
    cloudModel: readFormString(formData, "cloudModel"),
  };

  const clearKey = formData.get("clearLlmApiKey") === "on";
  const apiKeyRaw = formData.get("llmApiKey");
  if (clearKey) {
    patch.apiKey = null;
  } else if (typeof apiKeyRaw === "string" && apiKeyRaw.trim()) {
    patch.apiKey = apiKeyRaw.trim();
  }

  await updateLlmConfig(patch);
  revalidatePath("/settings");
  revalidatePath("/contacts");
}

/** @deprecated Use saveLlmForm */
export async function saveOllamaForm(formData: FormData) {
  return saveLlmForm(formData);
}

export type ClaimProfileState =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function claimSelfProfileFromUrl(
  _prev: ClaimProfileState | null,
  formData: FormData,
): Promise<ClaimProfileState> {
  const raw = formData.get("profileUrl");
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "Paste your LinkedIn profile URL." };
  }
  try {
    const db = getDb();
    const { contactId, created, canonicalUrl } =
      await ensureContactStubFromProfileUrl(db, raw);
    await updateUserContext({
      selfContactId: contactId,
      pendingSelfCaptureUrl: canonicalUrl,
      pendingSelfCaptureAt: new Date(),
    });
    revalidatePath("/me");
    revalidatePath("/contacts");
    return {
      ok: true,
      message: created
        ? `Contact created. The Clin extension will open your profile and capture visible fields (keep the extension installed; popup or within ~1 min). ${canonicalUrl}`
        : `Linked. Queued profile capture for the extension. ${canonicalUrl}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    return { ok: false, error: msg };
  }
}

export async function saveUserContextContactOnly(formData: FormData) {
  const selfRaw = formData.get("selfContactId");
  const selfContactId =
    typeof selfRaw === "string" && selfRaw.trim() !== ""
      ? selfRaw.trim()
      : null;

  const db = getDb();
  let pendingUrl: string | null = null;
  let pendingAt: Date | null = null;
  if (selfContactId) {
    const c = await db.query.contacts.findFirst({
      where: eq(contacts.id, selfContactId),
      columns: { linkedinUrlCanonical: true },
    });
    const u = c?.linkedinUrlCanonical?.trim();
    if (u) {
      pendingUrl = u;
      pendingAt = new Date();
    }
  }

  await updateUserContext({
    selfContactId,
    pendingSelfCaptureUrl: pendingUrl,
    pendingSelfCaptureAt: pendingAt,
  });
  revalidatePath("/me");
}

export async function saveUserContextForm(formData: FormData) {
  const goalsRaw = formData.get("goalsText");
  const goalsText =
    typeof goalsRaw === "string"
      ? goalsRaw.trim() === ""
        ? null
        : goalsRaw
      : null;

  const posRaw = formData.get("positioningSummary");
  const positioningSummary =
    typeof posRaw === "string"
      ? posRaw.trim() === ""
        ? null
        : posRaw
      : null;

  await updateUserContext({ goalsText, positioningSummary });
  revalidatePath("/me");
}

export async function saveAutopilotForm(formData: FormData) {
  const analyzeAfter = formData.get("autopilotAnalyzeAfterProfile") === "on";
  const rawLimit = formData.get("autopilotBatchDefaultLimit");
  let batchDefaultLimit: number | undefined;
  if (typeof rawLimit === "string" && rawLimit.trim() !== "") {
    const n = Number(rawLimit);
    if (Number.isFinite(n)) batchDefaultLimit = n;
  }
  await updateAutopilotSettings({
    analyzeAfterProfileCapture: analyzeAfter,
    campaignDraftOnReachOut:
      formData.get("autopilotCampaignDraftOnReachOut") === "on",
    campaignTagSkipGhost: formData.get("autopilotCampaignTagSkipGhost") === "on",
    campaignTagNurtureWarm:
      formData.get("autopilotCampaignTagNurtureWarm") === "on",
    ...(batchDefaultLimit !== undefined ? { batchDefaultLimit } : {}),
  });
  revalidatePath("/settings");
  revalidatePath("/autopilot");
}

export async function generateUserGoalsAndPositioningAction() {
  const llm = await getLlmConfig();
  const { goalsText, positioningSummary } = await runSelfGoalsAndPositioningLlm({
    settings: llm,
  });
  await updateUserContext({ goalsText, positioningSummary });
  revalidatePath("/me");
  revalidatePath("/branding/setup");
}

export type VoiceSetupSuggestActionResult =
  | {
      ok: true;
      goalsText: string;
      positioningSummary: string;
      contentDoctrine: string;
      expertiseSummary: string;
      rhythmWeekdays: string;
      rhythmTimeWindow: string;
    }
  | { ok: false; error: string };

export async function suggestVoiceSetupFromProfileAction(
  userBrief?: string,
): Promise<VoiceSetupSuggestActionResult> {
  try {
    const llm = await getLlmConfig();
    const data = await runVoiceSetupFromProfileLlm({
      settings: llm,
      userBrief: userBrief ?? null,
    });
    return { ok: true, ...data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function createCampaignAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const contextText = String(formData.get("contextText") ?? "").trim();
  const writerInstructions = String(
    formData.get("writerInstructions") ?? "",
  ).trim();
  const systemPromptOverride = String(
    formData.get("systemPromptOverride") ?? "",
  ).trim();
  if (!name || !contextText) {
    redirect("/campaigns/new?err=missing");
  }
  const id = await createOutreachCampaign(name, contextText, {
    writerInstructions: writerInstructions || null,
    systemPromptOverride: systemPromptOverride || null,
  });
  revalidatePath("/campaigns");
  redirect(`/campaigns/${id}`);
}

export async function updateCampaignAction(formData: FormData) {
  const id = String(formData.get("campaignId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const contextText = String(formData.get("contextText") ?? "").trim();
  const writerInstructions = String(
    formData.get("writerInstructions") ?? "",
  ).trim();
  const systemPromptOverride = String(
    formData.get("systemPromptOverride") ?? "",
  ).trim();
  if (!id) return;
  await updateOutreachCampaign(id, {
    name,
    contextText,
    writerInstructions: writerInstructions || null,
    systemPromptOverride: systemPromptOverride || null,
  });
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
}

export async function setActiveExtensionCampaignAction(formData: FormData) {
  const id = String(formData.get("campaignId") ?? "").trim();
  if (!id) return;
  await setActiveOutreachCampaignId(id);
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
}

export async function clearActiveExtensionCampaignAction() {
  await setActiveOutreachCampaignId(null);
  revalidatePath("/campaigns");
}

export async function setCaptureTargetCampaignAction(formData: FormData) {
  const id = String(formData.get("campaignId") ?? "").trim();
  if (!id) return;
  await setCaptureTargetCampaignId(id);
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
}

export async function clearCaptureTargetCampaignAction() {
  await setCaptureTargetCampaignId(null);
  revalidatePath("/campaigns");
}

/** One click: list building + extension Outreach tab use the same campaign. */
export async function setCaptureTargetAndActiveExtensionAction(formData: FormData) {
  const id = String(formData.get("campaignId") ?? "").trim();
  if (!id) return;
  await setCaptureTargetCampaignId(id);
  await setActiveOutreachCampaignId(id);
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
}

export async function addSegmentToCampaignAction(formData: FormData) {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const segment = String(formData.get("segment") ?? "").trim();
  const rawLimit = formData.get("limit");
  const n =
    typeof rawLimit === "string" && rawLimit.trim() !== ""
      ? Number(rawLimit)
      : 30;
  const limit = Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 30;
  if (!campaignId || !segment) return;
  await addContactsFromSegment(campaignId, segment, limit);
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function addContactIdsToCampaignAction(formData: FormData) {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const raw = String(formData.get("contactIds") ?? "");
  if (!campaignId) return;
  const ids = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return;
  await addContactsToCampaign(campaignId, ids);
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function addContactToCampaignFromContactAction(formData: FormData) {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const contactId = String(formData.get("contactId") ?? "").trim();
  if (!campaignId || !contactId) return;
  await addContactsToCampaign(campaignId, [contactId]);
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function generateOutreachBatchAction(formData: FormData) {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!campaignId) return;
  const raw = formData.get("limit");
  const n =
    typeof raw === "string" && raw.trim() !== "" ? Number(raw) : 6;
  const limit = Number.isFinite(n) ? Math.min(12, Math.max(1, n)) : 6;
  const allowWeakProfile =
    String(formData.get("allowWeakProfile") ?? "") === "1";
  const members = await listMembersNeedingDraft(campaignId, limit, {
    minProfileDepth: allowWeakProfile ? "missing" : "ok",
  });
  if (members.length === 0) {
    const hint = allowWeakProfile
      ? "No rows to generate (need draft status + empty draft)."
      : "No rows ready — capture detailed profiles first (About or Experience on LinkedIn), or check “Allow weak profile”.";
    redirect(
      `/campaigns/${campaignId}?batchInfo=${encodeURIComponent(hint)}`,
    );
  }
  let ok = 0;
  let firstErr: string | null = null;
  for (const m of members) {
    const r = await generateOutreachDraftForMember(m.id);
    if (r.ok) ok += 1;
    else if (!firstErr) firstErr = r.error;
  }
  revalidatePath(`/campaigns/${campaignId}`);
  if (firstErr && ok === 0) {
    redirect(
      `/campaigns/${campaignId}?draftErr=${encodeURIComponent(firstErr.slice(0, 500))}`,
    );
  }
  const q = new URLSearchParams();
  q.set("batchOk", String(ok));
  if (firstErr) q.set("draftWarn", firstErr.slice(0, 300));
  redirect(`/campaigns/${campaignId}?${q.toString()}`);
}

export async function generateOneOutreachDraftAction(formData: FormData) {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();
  if (!campaignId || !memberId) return;
  const result = await generateOutreachDraftForMember(memberId);
  revalidatePath(`/campaigns/${campaignId}`);
  if (!result.ok) {
    redirect(
      `/campaigns/${campaignId}?draftErr=${encodeURIComponent(result.error.slice(0, 500))}`,
    );
  }
  redirect(`/campaigns/${campaignId}?draftOk=1`);
}

export async function saveCampaignMemberDraftAction(formData: FormData) {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();
  const draft = String(formData.get("draftOutreach") ?? "");
  if (!campaignId || !memberId) return;
  await updateMemberDraft(memberId, draft.trim() || null);
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function approveCampaignMemberReadyAction(formData: FormData) {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();
  if (!campaignId || !memberId) return;
  await updateMemberStatus(memberId, "ready");
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function reopenCampaignMemberDraftAction(formData: FormData) {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();
  if (!campaignId || !memberId) return;
  await updateMemberStatus(memberId, "draft");
  revalidatePath(`/campaigns/${campaignId}`);
}

/** After you paste/send on LinkedIn yourself — same effect as extension "Mark sent (manual)". */
export async function markCampaignMemberSentAction(formData: FormData) {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();
  if (!campaignId || !memberId) return;
  const m = await findMemberById(memberId);
  if (!m || m.campaignId !== campaignId) return;
  await updateMemberStatus(memberId, "sent");
  const { setMemberMessageSentAt } = await import("@/lib/campaignMemberOutreach");
  await setMemberMessageSentAt(memberId);
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function updateMemberReplyOutcomeAction(formData: FormData) {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();
  const replyOutcome = String(formData.get("replyOutcome") ?? "unknown").trim();
  const noteRaw = String(formData.get("messageOutcomeNote") ?? "").trim();
  if (!campaignId || !memberId) return;
  const m = await findMemberById(memberId);
  if (!m || m.campaignId !== campaignId) return;
  const allowed = new Set(["unknown", "replied", "no_reply", "not_applicable"]);
  const outcome = allowed.has(replyOutcome) ? replyOutcome : "unknown";
  const { updateMemberReplyOutcome } = await import(
    "@/lib/campaignMemberOutreach"
  );
  await updateMemberReplyOutcome(memberId, outcome, noteRaw || null);
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function markCampaignMemberSkippedAction(formData: FormData) {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();
  if (!campaignId || !memberId) return;
  const m = await findMemberById(memberId);
  if (!m || m.campaignId !== campaignId) return;
  await updateMemberStatus(memberId, "skipped");
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function removeMemberFromCampaignAction(formData: FormData) {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();
  if (!campaignId || !memberId) return;
  await removeMemberFromCampaign(campaignId, memberId);
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}

export async function updateInboxThreadAction(formData: FormData) {
  const contactId = String(formData.get("contactId") ?? "").trim();
  const threadKey = String(formData.get("threadKey") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!contactId || !threadKey) return;
  const status = statusRaw as InboxThreadStatus;
  if (status !== "open" && status !== "done" && status !== "snoozed") return;

  let snoozedUntil: Date | null = null;
  if (status === "snoozed") {
    const raw = formData.get("snoozeDays");
    const n =
      typeof raw === "string" && raw.trim() ? Number(raw) : 1;
    const days = Number.isFinite(n) && n > 0 ? Math.min(n, 30) : 1;
    snoozedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  await upsertInboxThreadState({
    contactId,
    threadKey,
    status,
    snoozedUntil,
    note: note || null,
  });
  revalidatePath("/inbox");
}

const CONTACT_SEGMENT_OVERRIDES = new Set([
  "active",
  "warm",
  "dormant",
  "ghost",
  "remove_candidate",
]);

/** Manual segment on a contact (e.g. after LLM stewardship) — does not re-run rule scoring. */
export async function setContactSegmentOverrideAction(formData: FormData) {
  const contactId = String(formData.get("contactId") ?? "").trim();
  const segment = String(formData.get("segment") ?? "").trim();
  if (!contactId || !CONTACT_SEGMENT_OVERRIDES.has(segment)) return;
  const db = getDb();
  await db
    .update(contacts)
    .set({
      segment,
      lastUpdatedAt: new Date(),
    })
    .where(eq(contacts.id, contactId));
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/contacts");
}

export async function saveDataDirectoryForm(formData: FormData) {
  const raw = formData.get("dbDirectory");
  const dir =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
  await setStoredDbDirectory(dir);
  revalidatePath("/settings");
}

export async function triggerBackupNow(): Promise<
  { ok: true; path: string } | { ok: false; error: string }
> {
  try {
    const result = await backupAndRecord();
    revalidatePath("/settings");
    return { ok: true, path: result.path };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Backup failed",
    };
  }
}

export async function saveOutreachSendForm(formData: FormData) {
  const readInt = (key: string) => {
    const raw = formData.get(key);
    if (typeof raw !== "string" || raw.trim() === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const patch: OutreachSendSettingsPatch = {
    enabled: formData.get("outreachEnabled") === "on",
    sendMode:
      formData.get("outreachSendMode") === "auto" ? "auto" : "manual_confirm",
    minSecondsBetweenSends: readInt("minSecondsBetweenSends"),
    sendMaxPerDay: readInt("sendMaxPerDay"),
    sendJitterPercent: readInt("sendJitterPercent"),
  };
  await updateOutreachSendSettings(patch);
  revalidatePath("/settings");
}

export async function saveGlobalWriterForm(formData: FormData) {
  const raw = formData.get("globalWriterInstructions");
  const text =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
  await setGlobalWriterInstructions(text);
  revalidatePath("/me");
  revalidatePath("/campaigns");
}

function revalidateBranding() {
  revalidatePath("/branding");
  revalidatePath("/branding/setup");
  revalidatePath("/branding/calendar");
  revalidatePath("/branding/studio");
  revalidatePath("/branding/posts");
  revalidatePath("/me");
}

function parsePostLanguageForSave(
  raw: FormDataEntryValue | null,
): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (v === "fr" || v === "en") return v;
  return null;
}

function parseOptionalDate(raw: FormDataEntryValue | null): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function saveContentBrandContextAction(formData: FormData) {
  const { updateContentBrandContext } = await import("@/lib/contentBrandContext");
  const doctrine = formData.get("contentDoctrine");
  const expertise = formData.get("expertiseSummary");
  const stance = formData.get("stanceNotes");
  const rhythmRaw = formData.get("publishingRhythmJson");
  let publishingRhythm = null;
  if (typeof rhythmRaw === "string" && rhythmRaw.trim()) {
    try {
      publishingRhythm = JSON.parse(rhythmRaw) as import("@/db/schema").PublishingRhythmJson;
    } catch {
      /* keep null */
    }
  }
  await updateContentBrandContext({
    contentDoctrine:
      typeof doctrine === "string" && doctrine.trim() ? doctrine.trim() : null,
    expertiseSummary:
      typeof expertise === "string" && expertise.trim() ? expertise.trim() : null,
    stanceNotes:
      typeof stance === "string" && stance.trim() ? stance.trim() : null,
    publishingRhythm,
  });
  revalidateBranding();
}

export async function saveMentionRosterAction(formData: FormData) {
  const { updateContentBrandContext } = await import("@/lib/contentBrandContext");
  const mentionRoster = formData.get("mentionRoster");
  await updateContentBrandContext({
    mentionRoster:
      typeof mentionRoster === "string" && mentionRoster.trim()
        ? mentionRoster.trim()
        : null,
  });
  revalidateBranding();
  revalidatePath("/me");
}

export async function saveContentPostAction(formData: FormData) {
  const { updateContentPost } = await import("@/lib/contentPosts");
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  const title = formData.get("title");
  const statusRaw = formData.get("status");
  const formatRaw = formData.get("format");
  await updateContentPost(id, {
    title: typeof title === "string" && title.trim() ? title.trim() : "Untitled",
    status:
      typeof statusRaw === "string"
        ? (statusRaw as import("@/lib/contentPostsShared").ContentPostStatus)
        : "idea",
    format:
      typeof formatRaw === "string"
        ? (formatRaw as import("@/lib/contentPostsShared").ContentPostFormat)
        : "feed",
    ideaNotes: String(formData.get("ideaNotes") ?? "") || null,
    hook: String(formData.get("hook") ?? "") || null,
    body: String(formData.get("body") ?? "") || null,
    articleBody: String(formData.get("articleBody") ?? "") || null,
    styleNotes: String(formData.get("styleNotes") ?? "") || null,
    scheduledAt: parseOptionalDate(formData.get("scheduledAt")),
    mediaJson: parseMediaJsonField(formData.get("mediaJson")),
    language: parsePostLanguageForSave(formData.get("language")),
  });
  revalidateBranding();
  revalidatePath(`/branding/posts/${id}`);
}

function parseMediaJsonField(
  raw: FormDataEntryValue | null,
): import("@/db/schema").ContentMediaJson | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return null;
    return { items: parsed.items as import("@/db/schema").ContentMediaJson["items"] };
  } catch {
    return null;
  }
}

export async function createContentPostAction(formData: FormData) {
  const { createContentPost } = await import("@/lib/contentPosts");
  const { getOrCreateContentBrandContext } = await import(
    "@/lib/contentBrandContext"
  );
  const { parseContentLanguagePreference } = await import(
    "@/lib/contentLanguage"
  );
  const title = formData.get("title");
  const brand = await getOrCreateContentBrandContext();
  const pref = parseContentLanguagePreference(brand.contentLanguage);
  const id = await createContentPost({
    title: typeof title === "string" && title.trim() ? title.trim() : "New post",
    scheduledAt: parseOptionalDate(formData.get("scheduledAt")),
    ideaNotes: String(formData.get("ideaNotes") ?? "") || null,
    language: pref === "fr" || pref === "en" ? pref : null,
  });
  revalidateBranding();
  redirect(`/branding/posts/${id}`);
}

export async function updateContentPostStatusAction(formData: FormData) {
  const { updateContentPost } = await import("@/lib/contentPosts");
  const id = formData.get("id");
  const status = formData.get("status");
  if (typeof id !== "string" || typeof status !== "string") return;
  await updateContentPost(id, { status: status as import("@/lib/contentPostsShared").ContentPostStatus });
  revalidateBranding();
}

/** Persist unsaved editor fields before handoff actions (preview uses live state). */
async function persistPostEditorSnapshot(formData: FormData): Promise<string> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    throw new Error("Missing post id.");
  }
  const { updateContentPost } = await import("@/lib/contentPosts");
  const patch: Parameters<typeof updateContentPost>[1] = {};
  const mediaJson = parseMediaJsonField(formData.get("mediaJson"));
  if (mediaJson !== null) patch.mediaJson = mediaJson;
  const hook = formData.get("hook");
  const body = formData.get("body");
  if (typeof hook === "string") patch.hook = hook || null;
  if (typeof body === "string") patch.body = body || null;
  const title = formData.get("title");
  if (typeof title === "string" && title.trim()) {
    patch.title = title.trim();
  }
  const formatRaw = formData.get("format");
  if (typeof formatRaw === "string" && formatRaw.trim()) {
    patch.format = formatRaw as import("@/lib/contentPostsShared").ContentPostFormat;
  }
  if (Object.keys(patch).length > 0) {
    await updateContentPost(id, patch);
  }
  return id;
}

function revalidateContentPost(id: string) {
  revalidateBranding();
  revalidatePath(`/branding/posts/${id}`);
}

export async function markContentPostReadyAction(formData: FormData) {
  const { markContentPostReady } = await import("@/lib/contentPosts");
  const id = await persistPostEditorSnapshot(formData);
  const result = await markContentPostReady(id);
  if (!result.ok) {
    throw new Error(result.error ?? "Could not mark post ready.");
  }
  revalidateContentPost(id);
  redirect(`/branding/posts/${id}`);
}

export async function markContentPostPublishedAction(formData: FormData) {
  const { markContentPostPublished } = await import("@/lib/contentPosts");
  const id = await persistPostEditorSnapshot(formData);
  await markContentPostPublished(id);
  revalidateContentPost(id);
  redirect(`/branding/posts/${id}`);
}

export async function archiveContentPostAction(formData: FormData) {
  const id = await persistPostEditorSnapshot(formData);
  const { updateContentPost } = await import("@/lib/contentPosts");
  await updateContentPost(id, { status: "archived" });
  revalidateBranding();
  redirect("/branding/calendar");
}

export async function applyCoachActionsAction(
  actions: unknown[],
): Promise<{ applied: number; errors: string[]; createdPostIds: string[] }> {
  const { applyCoachActions } = await import("@/lib/brandCoachApply");
  const result = await applyCoachActions(actions);
  revalidateBranding();
  return result;
}

export async function completeVoiceSetupAction(formData: FormData) {
  const { updateUserContext } = await import("@/lib/userContext");
  const { updateContentBrandContext } = await import("@/lib/contentBrandContext");
  const { markVoiceSetupComplete } = await import("@/lib/voiceSetup");

  const goals = formData.get("goalsText");
  const positioning = formData.get("positioningSummary");
  const doctrine = formData.get("contentDoctrine");
  const expertise = formData.get("expertiseSummary");
  const rhythmDays = formData.get("rhythmWeekdays");
  const rhythmTime = formData.get("rhythmTimeWindow");

  await updateUserContext({
    goalsText: typeof goals === "string" && goals.trim() ? goals.trim() : null,
    positioningSummary:
      typeof positioning === "string" && positioning.trim()
        ? positioning.trim()
        : null,
  });

  let publishingRhythm: import("@/db/schema").PublishingRhythmJson | null = null;
  if (typeof rhythmDays === "string" && rhythmDays) {
    const weekdays = rhythmDays
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
    publishingRhythm = {
      preferredWeekdays: weekdays,
      timeWindow:
        typeof rhythmTime === "string" && rhythmTime.trim()
          ? rhythmTime.trim()
          : "08:45-09:15",
      maxPostsPerWeek: 2,
    };
  }

  const contentLanguageRaw = formData.get("contentLanguage");
  const { parseContentLanguagePreference } = await import(
    "@/lib/contentLanguage"
  );

  await updateContentBrandContext({
    contentDoctrine:
      typeof doctrine === "string" && doctrine.trim() ? doctrine.trim() : null,
    expertiseSummary:
      typeof expertise === "string" && expertise.trim() ? expertise.trim() : null,
    publishingRhythm,
    contentLanguage:
      typeof contentLanguageRaw === "string"
        ? parseContentLanguagePreference(contentLanguageRaw)
        : "auto",
  });

  await markVoiceSetupComplete();
  revalidateBranding();
  revalidatePath("/me");
  redirect("/branding/calendar");
}

export async function saveEditorialAutopilotAction(formData: FormData) {
  const { updateContentBrandContext, getOrCreateContentBrandContext } =
    await import("@/lib/contentBrandContext");
  const brand = await getOrCreateContentBrandContext();
  const existing = brand.editorialAutopilotPolicy ?? {};

  const trendRaw = formData.get("trendQueries");
  const trendQueries =
    typeof trendRaw === "string"
      ? trendRaw
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      : existing.trendQueries ?? [];

  const maxPostsRaw = formData.get("maxPostsPerRun");
  const maxPostsPerRun =
    typeof maxPostsRaw === "string" && maxPostsRaw
      ? Math.min(10, Math.max(1, parseInt(maxPostsRaw, 10) || 3))
      : existing.maxPostsPerRun ?? 3;

  const horizonRaw = formData.get("planningHorizonDays");
  const planningHorizonDays =
    typeof horizonRaw === "string"
      ? parseInt(horizonRaw, 10) || 14
      : brand.planningHorizonDays ?? 14;

  await updateContentBrandContext({
    editorialAutopilotEnabled: formData.get("editorialAutopilotEnabled") === "on",
    marketRegion:
      typeof formData.get("marketRegion") === "string"
        ? String(formData.get("marketRegion"))
        : "fr",
    planningHorizonDays,
    editorialAutopilotPolicy: {
      ...existing,
      trendQueries,
      maxPostsPerRun,
      runDraftWhenDue: formData.get("runDraftWhenDue") === "on",
      includeImage: formData.get("includeImage") === "on",
      autoMarkReady: formData.get("autoMarkReady") === "on",
      tavilyDiscoveryEnabled: formData.get("tavilyDiscoveryEnabled") === "on",
      useUnicodeEmphasis: formData.get("useUnicodeEmphasis") === "on",
      maxTavilyCreditsPerTick: existing.maxTavilyCreditsPerTick ?? 5,
      maxTrendItemsPerWeek: existing.maxTrendItemsPerWeek ?? 15,
    },
  });
  revalidatePath("/settings");
  revalidateBranding();
}

export async function enableSourcePackAction(formData: FormData) {
  const packId = formData.get("packId");
  if (typeof packId !== "string" || !packId.trim()) return;
  const { enableSourcePack } = await import("@/lib/sources/sourcePacks");
  await enableSourcePack(packId.trim());
  const { enqueueEditorialJob } = await import("@/lib/editorial/editorialJobs");
  await enqueueEditorialJob({ type: "ingest_trends", runAfter: new Date() });
  revalidatePath("/settings");
  revalidateBranding();
}

export async function enqueueTrendsRefreshAction(_formData?: FormData) {
  void _formData;
  const { enqueueEditorialJob } = await import("@/lib/editorial/editorialJobs");
  await enqueueEditorialJob({ type: "ingest_trends", runAfter: new Date() });
  revalidatePath("/settings");
  revalidateBranding();
}

export async function enqueueSourcesRefreshAction(_formData?: FormData) {
  void _formData;
  const { enqueueEditorialJob } = await import("@/lib/editorial/editorialJobs");
  await enqueueEditorialJob({ type: "ingest_sources", runAfter: new Date() });
  revalidatePath("/settings");
  revalidateBranding();
}

export async function saveSdSettingsAction(formData: FormData) {
  const { updateSdSettings } = await import("@/lib/sdSettings");
  await updateSdSettings({
    userEnabled: formData.get("sdEnabled") === "on",
  });
  revalidatePath("/settings");
}
