import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  contentBrandContext,
  type EditorialAutopilotPolicyJson,
  type PublishingRhythmJson,
} from "@/db/schema";

const DEFAULT_ID = "default";

export type ContentBrandContextRow = {
  id: string;
  contentDoctrine: string | null;
  expertiseSummary: string | null;
  publishingRhythm: PublishingRhythmJson | null;
  stanceNotes: string | null;
  mentionRoster: string | null;
  contentLanguage: string | null;
  marketRegion: string | null;
  planningHorizonDays: number | null;
  editorialAutopilotEnabled: boolean | null;
  editorialAutopilotPolicy: EditorialAutopilotPolicyJson | null;
  updatedAt: Date;
};

export async function getOrCreateContentBrandContext(): Promise<ContentBrandContextRow> {
  const db = getDb();
  const existing = await db
    .select()
    .from(contentBrandContext)
    .where(eq(contentBrandContext.id, DEFAULT_ID))
    .limit(1);

  if (existing[0]) {
    return existing[0];
  }

  const now = new Date();
  await db.insert(contentBrandContext).values({
    id: DEFAULT_ID,
    contentLanguage: "auto",
    marketRegion: "fr",
    planningHorizonDays: 14,
    editorialAutopilotEnabled: false,
    updatedAt: now,
  });
  return {
    id: DEFAULT_ID,
    contentDoctrine: null,
    expertiseSummary: null,
    publishingRhythm: null,
    stanceNotes: null,
    mentionRoster: null,
    contentLanguage: "auto",
    marketRegion: "fr",
    planningHorizonDays: 14,
    editorialAutopilotEnabled: false,
    editorialAutopilotPolicy: null,
    updatedAt: now,
  };
}

export async function updateContentBrandContext(patch: {
  contentDoctrine?: string | null;
  expertiseSummary?: string | null;
  publishingRhythm?: PublishingRhythmJson | null;
  stanceNotes?: string | null;
  mentionRoster?: string | null;
  contentLanguage?: string | null;
  marketRegion?: string | null;
  planningHorizonDays?: number | null;
  editorialAutopilotEnabled?: boolean | null;
  editorialAutopilotPolicy?: EditorialAutopilotPolicyJson | null;
}): Promise<void> {
  await getOrCreateContentBrandContext();
  const db = getDb();
  await db
    .update(contentBrandContext)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(contentBrandContext.id, DEFAULT_ID));
}
