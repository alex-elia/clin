import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countRemovalSignals,
  filterUnstagedRemovalSignals,
} from "@/lib/cleaningRemovalSignals";
import type { NetworkHygieneRow } from "@/lib/networkHygieneTypes";

function row(
  partial: Partial<NetworkHygieneRow> & Pick<NetworkHygieneRow, "contactId">,
): NetworkHygieneRow {
  return {
    fullName: "Test",
    headline: null,
    company: null,
    linkedinUrl: "https://linkedin.com/in/test",
    connectionDegree: "1st",
    segment: "ghost",
    relationshipScore: 10,
    cleanupScore: 80,
    activityTier: null,
    extractionLevel: "full",
    hasProfileCapture: true,
    hasPostsCapture: false,
    hasMessagingCapture: false,
    hasConnectionsListCapture: false,
    hasLlmAnalysis: true,
    threadStage: null,
    bucket: null,
    zombieLevel: "high",
    removeVerdict: "maybe",
    adviceConfidence: "medium",
    reasons: ["Cleanup score: 80"],
    canDisconnect: true,
    ...partial,
  };
}

describe("cleaningRemovalSignals", () => {
  it("counts staged and unstaged removal signals", () => {
    const rows = [
      row({ contactId: "1", removeVerdict: "yes", bucket: "review_remove" }),
      row({ contactId: "2", removeVerdict: "maybe", bucket: "needs_review" }),
      row({ contactId: "3", removeVerdict: "no", bucket: "keep_passive" }),
    ];
    const counts = countRemovalSignals(rows);
    assert.equal(counts.yes, 1);
    assert.equal(counts.maybe, 1);
    assert.equal(counts.unstagedSignals, 1);
  });

  it("filters unstaged maybe signals", () => {
    const rows = [
      row({ contactId: "1", removeVerdict: "yes", bucket: "review_remove" }),
      row({ contactId: "2", removeVerdict: "maybe", bucket: "needs_review" }),
    ];
    const maybe = filterUnstagedRemovalSignals(rows, "maybe");
    assert.equal(maybe.length, 1);
    assert.equal(maybe[0]?.contactId, "2");
  });
});
