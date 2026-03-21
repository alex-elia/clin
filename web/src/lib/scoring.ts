import type { contacts } from "@/db/schema";

export const SCORE_RULE_VERSION = "1";

type ContactRow = typeof contacts.$inferSelect;

export type ScoreResult = {
  segment: string;
  relationshipScore: number;
  businessScore: number;
  cleanupScore: number;
  relationshipReasons: string[];
  businessReasons: string[];
  cleanupReasons: string[];
};

const BUSINESS_HINTS =
  /\b(founder|ceo|cto|cfo|vp|director|head of|sales|revenue|growth|partnership|invest|hiring|recruit|talent|procurement|buyer)\b/i;

function daysSince(date: Date | null | undefined): number | null {
  if (!date) return null;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

export function scoreContact(row: Partial<ContactRow> & { lastSeenAt?: Date | null }): ScoreResult {
  const relationshipReasons: string[] = [];
  const businessReasons: string[] = [];
  const cleanupReasons: string[] = [];

  const days = daysSince(row.lastSeenAt ?? null);

  let relationshipScore = 35;
  if (days === null) {
    relationshipReasons.push("No prior capture timestamp; default relationship score.");
    relationshipScore = 30;
  } else if (days <= 14) {
    relationshipScore = 85;
    relationshipReasons.push("Seen within 14 days — strong recency.");
  } else if (days <= 45) {
    relationshipScore = 65;
    relationshipReasons.push("Seen within 45 days — moderate recency.");
  } else if (days <= 120) {
    relationshipScore = 45;
    relationshipReasons.push("Seen within 120 days — cooling.");
  } else {
    relationshipScore = 25;
    relationshipReasons.push("Not seen in 120+ days — dormant signal.");
  }

  let businessScore = 20;
  const headline = row.headline ?? "";
  if (BUSINESS_HINTS.test(headline)) {
    businessScore += 35;
    businessReasons.push("Headline matches business-relevant keywords.");
  } else {
    businessReasons.push("No strong business keyword match in headline.");
  }
  if (row.companyNormalized) {
    businessScore += 10;
    businessReasons.push("Company present — better account context.");
  }
  businessScore = Math.min(100, businessScore);

  let cleanupScore = 15;
  if (relationshipScore < 40) {
    cleanupScore += 40;
    cleanupReasons.push("Low relationship recency increases cleanup consideration.");
  }
  if (!row.headline?.trim()) {
    cleanupScore += 15;
    cleanupReasons.push("Missing headline — incomplete profile capture.");
  }
  cleanupScore = Math.min(100, cleanupScore);

  let segment = "warm";
  if (relationshipScore >= 70) segment = "active";
  else if (relationshipScore >= 50) segment = "warm";
  else if (relationshipScore >= 35) segment = "dormant";
  else segment = "ghost";

  if (cleanupScore >= 70) {
    segment = "remove_candidate";
    cleanupReasons.push("High cleanup score — candidate for removal review.");
  }

  return {
    segment,
    relationshipScore,
    businessScore,
    cleanupScore,
    relationshipReasons,
    businessReasons,
    cleanupReasons,
  };
}
