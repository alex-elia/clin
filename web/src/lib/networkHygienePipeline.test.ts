import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { contacts } from "@/db/schema";
import type { ContactReadiness } from "@/lib/contactReadinessShared";
import {
  assessNetworkHygiene,
  computeAdviceConfidence,
  type HygieneAssessInput,
} from "./networkHygienePipeline";

type ContactRow = typeof contacts.$inferSelect;

function baseContact(overrides: Partial<ContactRow> = {}): ContactRow {
  return {
    id: "c1",
    linkedinUrlCanonical: "https://www.linkedin.com/in/test",
    linkedinUrlRaw: null,
    fullName: "Test User",
    headline: "Engineer",
    company: "Acme",
    companyNormalized: null,
    location: null,
    connectionDegree: "1st",
    segment: "warm",
    relationshipScore: 50,
    businessScore: 40,
    cleanupScore: 30,
    relationshipReasons: null,
    businessReasons: null,
    cleanupReasons: null,
    scoreRuleVersion: "1",
    lastSeenAt: new Date("2026-01-01"),
    lastUpdatedAt: new Date("2026-01-01"),
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function baseReadiness(
  overrides: Partial<ContactReadiness> = {},
): ContactReadiness {
  return {
    contactId: "c1",
    profileDepth: "ok",
    hasProfileCapture: true,
    hasMessagingCapture: false,
    hasHeadline: true,
    hasCompany: true,
    extractionLevel: "profile_ok",
    readyForAnalysis: true,
    readyForDecisions: true,
    missing: [],
    ...overrides,
  };
}

function assess(overrides: Partial<HygieneAssessInput>): ReturnType<
  typeof assessNetworkHygiene
> {
  return assessNetworkHygiene({
    row: baseContact(),
    readiness: baseReadiness(),
    analysis: null,
    threadAnalysis: null,
    activityTier: null,
    bucket: null,
    hasPostsCapture: false,
    hasConnectionsListCapture: false,
    ...overrides,
  });
}

describe("computeAdviceConfidence", () => {
  it("returns high when profile, LLM, and posts or messaging", () => {
    const c = computeAdviceConfidence({
      row: baseContact(),
      readiness: baseReadiness({ hasMessagingCapture: true }),
      analysis: {
        tier: "refined",
        stewardship: { recommendation: "keep" },
      } as HygieneAssessInput["analysis"],
      threadAnalysis: null,
      activityTier: null,
      bucket: null,
      hasPostsCapture: false,
      hasConnectionsListCapture: false,
    });
    assert.equal(c, "high");
  });

  it("returns low for list-only", () => {
    const c = computeAdviceConfidence({
      row: baseContact(),
      readiness: baseReadiness({
        extractionLevel: "list_only",
        hasProfileCapture: false,
      }),
      analysis: null,
      threadAnalysis: null,
      activityTier: null,
      bucket: null,
      hasPostsCapture: false,
      hasConnectionsListCapture: true,
    });
    assert.equal(c, "low");
  });
});

describe("assessNetworkHygiene", () => {
  it("marks 2nd degree as not_applicable disconnect", () => {
    const r = assess({
      row: baseContact({ connectionDegree: "2nd" }),
    });
    assert.equal(r.removeVerdict, "not_applicable");
    assert.equal(r.canDisconnect, false);
  });

  it("returns yes for 1st with review_remove bucket", () => {
    const r = assess({
      bucket: "review_remove",
    });
    assert.equal(r.removeVerdict, "yes");
    assert.ok(r.reasons.some((x) => x.includes("review_remove")));
  });

  it("returns maybe when thread suggests removal but not in review bucket", () => {
    const r = assess({
      threadAnalysis: {
        thread_stage: "ghosted",
        thread_summary: "Quiet",
        urgency: "low",
        strategy_verdict: "no_reply",
        recommended_action: "mark_done",
        sales_rationale: "Ghosted",
        action_rationale: "Remove",
      },
    });
    assert.equal(r.zombieLevel, "high");
    assert.equal(r.removeVerdict, "maybe");
  });

  it("caps maybe with low confidence on medium zombie", () => {
    const r = assess({
      readiness: baseReadiness({
        extractionLevel: "list_only",
        hasProfileCapture: false,
      }),
      activityTier: "dormant",
      row: baseContact({ cleanupScore: 60 }),
    });
    assert.equal(r.zombieLevel, "medium");
    assert.equal(r.removeVerdict, "maybe");
    assert.equal(r.adviceConfidence, "low");
  });

  it("keeps active contacts with occasional activity", () => {
    const r = assess({
      activityTier: "occasional",
      row: baseContact({ segment: "active" }),
    });
    assert.equal(r.zombieLevel, "active");
    assert.equal(r.removeVerdict, "no");
  });

  it("flags remove_candidate segment as high zombie with maybe verdict", () => {
    const r = assess({
      row: baseContact({ segment: "remove_candidate" }),
    });
    assert.equal(r.zombieLevel, "high");
    assert.equal(r.removeVerdict, "maybe");
  });

  it("returns yes for thread removal when in review_remove bucket", () => {
    const r = assess({
      bucket: "review_remove",
      threadAnalysis: {
        thread_stage: "ghosted",
        thread_summary: "Quiet",
        urgency: "low",
        strategy_verdict: "no_reply",
        recommended_action: "mark_done",
        sales_rationale: "Ghosted",
        action_rationale: "Remove",
      },
    });
    assert.equal(r.removeVerdict, "yes");
  });
});
