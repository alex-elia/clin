/** Client-safe campaign prep autopilot types and constants (no DB). */

export const CAMPAIGN_PREP_MIN_BRIEF_CHARS = 12;

export type CampaignPlanFromBrief = {
  name: string;
  contextText: string;
  icpText: string;
  writerInstructions?: string;
};

export type ContactSuggestion = {
  contactId: string;
  fullName: string | null;
  headline: string | null;
  company: string | null;
  fit: "strong" | "partial" | "weak";
  rationale: string;
};
