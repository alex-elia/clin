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
import {
  getOllamaSettings,
  updateOllamaSettings,
} from "@/lib/ollamaSettings";
import { updatePaceSettings } from "@/lib/pace";
import { SCORE_RULE_VERSION, scoreContact } from "@/lib/scoring";
import { runSelfGoalsAndPositioningLlm } from "@/lib/userProfileLlm";
import { updateAutopilotSettings } from "@/lib/autopilot";
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
    maxPerDay: readInt("automationMaxPerDay"),
    minGapSeconds: readInt("automationMinGapSeconds"),
    maxGapSeconds: readInt("automationMaxGapSeconds"),
    jitterPercent: readInt("automationJitterPercent"),
  };
  await updateAutomationSettings(patch);
  revalidatePath("/settings");
}

export async function saveOllamaForm(formData: FormData) {
  const baseRaw = formData.get("ollamaBaseUrl");
  const modelRaw = formData.get("ollamaModel");
  await updateOllamaSettings({
    baseUrl:
      typeof baseRaw === "string" && baseRaw.trim() ? baseRaw.trim() : undefined,
    model:
      typeof modelRaw === "string" && modelRaw.trim() ? modelRaw.trim() : undefined,
  });
  revalidatePath("/settings");
  revalidatePath("/contacts");
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
    ...(batchDefaultLimit !== undefined ? { batchDefaultLimit } : {}),
  });
  revalidatePath("/settings");
  revalidatePath("/autopilot");
}

export async function generateUserGoalsAndPositioningAction() {
  const ollama = await getOllamaSettings();
  const { goalsText, positioningSummary } = await runSelfGoalsAndPositioningLlm({
    settings: ollama,
  });
  await updateUserContext({ goalsText, positioningSummary });
  revalidatePath("/me");
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
