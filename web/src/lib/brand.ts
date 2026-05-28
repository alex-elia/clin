import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";

export const BRAND_KEYS = {
  globalWriterInstructions: "brand.global_writer_instructions",
} as const;

export type ClinBrandPublic = {
  displayName: "Clin";
  tagline: string;
  primaryColor: string;
  logoUrl: string;
  iconUrl: string;
};

const DEFAULT_TAGLINE = "Local LinkedIn network intelligence";

export function getClinBrandPublic(): ClinBrandPublic {
  return {
    displayName: "Clin",
    tagline: DEFAULT_TAGLINE,
    primaryColor: "#4fc3a1",
    logoUrl: "/brand/Clin_Logo_Small.png",
    iconUrl: "/brand/Clin_Logo_Small.png",
  };
}

export async function getGlobalWriterInstructions(): Promise<string | null> {
  const db = getDb();
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, BRAND_KEYS.globalWriterInstructions),
  });
  const v = row?.value?.trim();
  return v || null;
}

export async function setGlobalWriterInstructions(
  text: string | null,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  const key = BRAND_KEYS.globalWriterInstructions;
  if (!text?.trim()) {
    await db.delete(appSettings).where(eq(appSettings.key, key));
    return;
  }
  const value = text.trim();
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
