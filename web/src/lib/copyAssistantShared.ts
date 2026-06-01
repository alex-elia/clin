import { z } from "zod";

/** Client-safe types and labels — no Node/SQLite imports. */

export const copyAudienceSchema = z.enum(["b2b", "b2c", "growth"]);
export type CopyAudience = z.infer<typeof copyAudienceSchema>;

export const copyFieldSchema = z.enum([
  "campaign_name",
  "campaign_context",
  "campaign_writer",
  "global_writer",
  "user_goals",
  "user_positioning",
  "post_hook",
  "post_body",
  "post_style_notes",
  "post_article_body",
  "content_doctrine",
  "expertise_summary",
]);
export type CopyField = z.infer<typeof copyFieldSchema>;

export const generateCopyRequestSchema = z.object({
  field: copyFieldSchema,
  audience: copyAudienceSchema,
  prompt: z.string().min(3).max(800),
  context: z
    .object({
      campaignName: z.string().max(200).optional(),
      campaignContext: z.string().max(12_000).optional(),
      existingText: z.string().max(12_000).optional(),
      goalsText: z.string().max(8_000).optional(),
      positioningSummary: z.string().max(8_000).optional(),
      contentLanguage: z.enum(["auto", "fr", "en"]).optional(),
      postLanguage: z.enum(["fr", "en"]).optional(),
    })
    .optional(),
});

export type GenerateCopyRequest = z.infer<typeof generateCopyRequestSchema>;

export const COPY_AUDIENCE_LABELS: Record<
  CopyAudience,
  { label: string; hint: string }
> = {
  b2b: {
    label: "B2B",
    hint: "Consultative, ICP-focused, proof and mutual value",
  },
  b2c: {
    label: "B2C",
    hint: "Clear benefit, simple language, empathy",
  },
  growth: {
    label: "Growth",
    hint: "Sharp hooks, curiosity, test-and-learn tone (ethical)",
  },
};
