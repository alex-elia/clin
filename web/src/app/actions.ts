"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
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

export async function generateUserGoalsAndPositioningAction() {
  const ollama = await getOllamaSettings();
  const { goalsText, positioningSummary } = await runSelfGoalsAndPositioningLlm({
    settings: ollama,
  });
  await updateUserContext({ goalsText, positioningSummary });
  revalidatePath("/me");
}
