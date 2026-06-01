import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";
import { getOrCreateUserContext } from "@/lib/userContext";

const SETUP_COMPLETE_KEY = "branding.voice_setup_complete";

export type VoiceSetupStatus = {
  complete: boolean;
  steps: {
    profileLinked: boolean;
    goalsSet: boolean;
    positioningSet: boolean;
    doctrineSet: boolean;
  };
  missing: string[];
};

export async function isVoiceSetupMarkedComplete(): Promise<boolean> {
  const db = getDb();
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, SETUP_COMPLETE_KEY),
  });
  return row?.value === "true";
}

async function upsertSetting(key: string, value: string): Promise<void> {
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

export async function markVoiceSetupComplete(): Promise<void> {
  await upsertSetting(SETUP_COMPLETE_KEY, "true");
}

export async function getVoiceSetupStatus(): Promise<VoiceSetupStatus> {
  const [ctx, brand, marked] = await Promise.all([
    getOrCreateUserContext(),
    getOrCreateContentBrandContext(),
    isVoiceSetupMarkedComplete(),
  ]);

  const profileLinked = Boolean(ctx.selfContactId);
  const goalsSet = Boolean(ctx.goalsText?.trim());
  const positioningSet = Boolean(ctx.positioningSummary?.trim());
  const doctrineSet = Boolean(brand.contentDoctrine?.trim());

  const missing: string[] = [];
  if (!profileLinked) missing.push("Link your LinkedIn profile contact");
  if (!goalsSet) missing.push("Set your goals");
  if (!positioningSet) missing.push("Set your positioning");

  const complete =
    marked || (profileLinked && goalsSet && positioningSet);

  return {
    complete,
    steps: { profileLinked, goalsSet, positioningSet, doctrineSet },
    missing,
  };
}
