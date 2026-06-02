/** Client-safe Cleaning board types (no DB imports). */

import type { CleaningBucket } from "@/lib/cleaningBuckets";
import type { LlmAnalysisView } from "@/lib/contactLlmDisplay";
import type { ContactReadiness } from "@/lib/contactReadinessShared";

export type CleaningContactCard = {
  contactId: string;
  fullName: string | null;
  headline: string | null;
  company: string | null;
  linkedinUrl: string;
  segment: string;
  bucket: CleaningBucket;
  readiness: ContactReadiness;
  analysis: LlmAnalysisView | null;
  compositeScore: number | null;
};

export type CleaningBoardSummary = {
  totalContacts: number;
  readyForAnalysis: number;
  readyForDecisions: number;
  pendingLlmAnalysis: number;
  needsProfileCapture: number;
  analyzedInBoard: number;
  bucketCounts: Record<CleaningBucket, number>;
};

export type CleaningBoardData = {
  summary: CleaningBoardSummary;
  byBucket: Record<CleaningBucket, CleaningContactCard[]>;
};
