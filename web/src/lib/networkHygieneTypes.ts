import type { CleaningBucket } from "@/lib/cleaningBuckets";
import type { LinkedInActivityTier } from "@/lib/linkedinActivity";
import type { ThreadStage } from "@/lib/inboxThreadAnalysisTypes";

export {
  NORMALIZED_CONNECTION_DEGREES as NETWORK_HYGIENE_DEGREES,
  type NormalizedConnectionDegree as NetworkHygieneDegree,
} from "@/lib/connectionDegree";

export type ZombieLevel = "high" | "medium" | "low" | "active";
export type RemoveVerdict = "yes" | "maybe" | "no" | "not_applicable";
export type AdviceConfidence = "high" | "medium" | "low";

export type NetworkHygieneRow = {
  contactId: string;
  fullName: string | null;
  headline: string | null;
  company: string | null;
  linkedinUrl: string;
  connectionDegree: string;
  segment: string;
  relationshipScore: number;
  cleanupScore: number;
  activityTier: LinkedInActivityTier | null;
  extractionLevel: string;
  hasProfileCapture: boolean;
  hasPostsCapture: boolean;
  hasMessagingCapture: boolean;
  hasConnectionsListCapture: boolean;
  hasLlmAnalysis: boolean;
  threadStage: ThreadStage | null;
  bucket: CleaningBucket | null;
  zombieLevel: ZombieLevel;
  removeVerdict: RemoveVerdict;
  adviceConfidence: AdviceConfidence;
  reasons: string[];
  canDisconnect: boolean;
};

export type NetworkHygieneMetrics = {
  totalContacts: number;
  withAnyCapture: number;
  unknownDegree: number;
  withConnectionsListCapture: number;
  inPipelineScope: number;
  withProfileCapture: number;
  withPostsCapture: number;
  withMessagingCapture: number;
  withLlmAnalysis: number;
  adviceConfidenceHigh: number;
  adviceConfidenceMedium: number;
  adviceConfidenceLow: number;
  byConnectionDegree: Record<string, number>;
  byExtractionLevel: Record<string, number>;
  firstDegreeCount: number;
  bySegment: Record<string, number>;
  removeCandidateCount: number;
  staleCapture120d: number;
  highCleanup: number;
  avgRelationshipScore: number;
  avgCleanupScore: number;
  byActivityTier: Record<string, number>;
  activityUnknown: number;
  lurkerOrDormant: number;
  activeOrOccasional: number;
  withThreadAnalysis: number;
  byThreadStage: Record<string, number>;
  ghostedCount: number;
  coldNoReplyCount: number;
  threadSuggestsRemovalCount: number;
  byStewardship: Record<string, number>;
  byCleaningBucket: Record<string, number>;
  reviewRemoveBucket: number;
  pendingLlmAnalysis: number;
  removableFirstYes: number;
  removableFirstMaybe: number;
  notApplicableDisconnect: number;
  removalQueuePending: number;
  byZombieLevel: Record<ZombieLevel, number>;
  byRemoveVerdict: Record<RemoveVerdict, number>;
};

export type NetworkHygieneActHints = {
  syncConnectionsList: boolean;
  analyzeGapCount: number;
  enrichProfileCount: number;
  capturePostsCount: number;
  captureMessagingCount: number;
  queueRemovalYesCount: number;
  queueRemovalMaybeCount: number;
  connectionsListUrl: string;
};

export type NetworkHygieneSnapshot = {
  runAt: string;
  metrics: NetworkHygieneMetrics;
  rows: NetworkHygieneRow[];
  topRemovalCandidates: NetworkHygieneRow[];
  actHints: NetworkHygieneActHints;
};
