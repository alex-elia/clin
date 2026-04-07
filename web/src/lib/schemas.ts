import { z } from "zod";

export const capturePayloadSchema = z.object({
  schemaVersion: z.string().min(1),
  pageType: z.enum(["profile", "connections", "unknown"]),
  sourceUrl: z.string().url(),
  capturedAt: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  extractedFields: z.object({
    fullName: z.string().optional(),
    headline: z.string().optional(),
    company: z.string().optional(),
    location: z.string().optional(),
    connectionDegree: z.string().optional(),
    about: z.string().max(20_000).optional(),
    experienceBullets: z.array(z.string().max(600)).max(25).optional(),
    educationBullets: z.array(z.string().max(500)).max(20).optional(),
  }),
  fieldPresence: z.record(z.string(), z.boolean()).optional(),
  /** When set (by the extension), server adds this contact to the campaign after ingest. */
  outreachCampaignId: z.string().min(1).optional(),
});

export const connectionRowSchema = z.object({
  profileUrl: z.string().url(),
  fullName: z.string().optional(),
  headline: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  connectionDegree: z.string().optional(),
});

/** Visible rows from a connections or people-search list (one POST per page / scroll batch). */
export const connectionsPagePayloadSchema = z.object({
  schemaVersion: z.string().min(1),
  pageType: z.literal("connections"),
  listSourceUrl: z.string().url(),
  capturedAt: z.string().optional(),
  rows: z.array(connectionRowSchema).min(1).max(220),
  outreachCampaignId: z.string().min(1).optional(),
});

export const automationAckSchema = z.object({
  contactId: z.string().min(1),
  outcome: z.enum(["ok", "skip", "error"]),
});

export const automationSettingsPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    connectionsSprintEnabled: z.boolean().optional(),
    maxPerDay: z.number().int().optional(),
    minGapSeconds: z.number().int().optional(),
    maxGapSeconds: z.number().int().optional(),
    jitterPercent: z.number().int().optional(),
  })
  .strict();

export const contactAnalyzeBodySchema = z
  .object({
    tier: z.enum(["provisional", "refined", "auto"]).default("auto"),
    messageContext: z.string().max(32_000).optional(),
    persistMessageContext: z.boolean().optional(),
  })
  .strict();

