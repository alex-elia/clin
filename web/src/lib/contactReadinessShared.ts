/** Client-safe types and labels (no SQLite / Node imports). */

export type ProfileDepth = "missing" | "thin" | "ok";

export type ExtractionReadiness =
  | "list_only"
  | "thin_profile"
  | "profile_ok"
  | "profile_and_messages";

export type ContactReadiness = {
  contactId: string;
  profileDepth: ProfileDepth;
  hasProfileCapture: boolean;
  hasMessagingCapture: boolean;
  hasHeadline: boolean;
  hasCompany: boolean;
  extractionLevel: ExtractionReadiness;
  readyForAnalysis: boolean;
  readyForDecisions: boolean;
  missing: string[];
};

export const EXTRACTION_READINESS_LABELS: Record<ExtractionReadiness, string> =
  {
    list_only: "List / card only",
    thin_profile: "Thin profile",
    profile_ok: "Profile captured",
    profile_and_messages: "Profile + messages",
  };
