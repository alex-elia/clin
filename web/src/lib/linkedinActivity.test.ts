import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeLinkedInActivity,
  activityTierAllowsEngage,
} from "./linkedinActivity";
import {
  estimatePostAgeDays,
  sortPostsByEstimatedAge,
} from "./profilePostRecency";

const NOW = new Date("2026-06-07T12:00:00.000Z");

describe("estimatePostAgeDays", () => {
  it("parses relative labels", () => {
    assert.equal(estimatePostAgeDays("2 mo", NOW), 60);
    assert.equal(estimatePostAgeDays("3 w", NOW), 21);
    assert.equal(estimatePostAgeDays("1 yr", NOW), 365);
    assert.equal(estimatePostAgeDays("Yesterday", NOW), 0);
  });

  it("returns null for empty label", () => {
    assert.equal(estimatePostAgeDays("", NOW), null);
    assert.equal(estimatePostAgeDays(undefined, NOW), null);
  });
});

describe("sortPostsByEstimatedAge", () => {
  it("orders newest first", () => {
    const sorted = sortPostsByEstimatedAge(
      [
        { text: "old post here enough text", ageLabel: "2 yr" },
        { text: "new post here enough text", ageLabel: "1 mo" },
      ],
      NOW,
    );
    assert.equal(sorted[0]?.ageLabel, "1 mo");
  });
});

describe("computeLinkedInActivity", () => {
  it("classifies lurker when all posts stale", () => {
    const a = computeLinkedInActivity({
      hasPostsCapture: true,
      postsCapturedAt: NOW.toISOString(),
      profilePosts: [
        { text: "Stale post one with enough chars", ageLabel: "2 yr" },
        { text: "Stale post two with enough chars", ageLabel: "18 mo" },
      ],
      now: NOW,
    });
    assert.equal(a.tier, "lurker");
    assert.equal(a.recentPostCount, 0);
    assert.ok(a.score != null && a.score < 30);
  });

  it("classifies occasional when recent posts are older than 3 months", () => {
    const a = computeLinkedInActivity({
      hasPostsCapture: true,
      postsCapturedAt: NOW.toISOString(),
      profilePosts: [
        { text: "Older recent post alpha enough text", ageLabel: "5 mo" },
        { text: "Older recent post beta enough text", ageLabel: "6 mo" },
      ],
      now: NOW,
    });
    assert.equal(a.tier, "occasional");
    assert.equal(a.recentPostCount, 2);
    assert.ok(a.score != null && a.score < 70);
  });

  it("classifies active only when newest post is within 3 months", () => {
    const a = computeLinkedInActivity({
      hasPostsCapture: true,
      postsCapturedAt: NOW.toISOString(),
      profilePosts: [
        { text: "Recent post alpha with enough text", ageLabel: "2 w" },
        { text: "Recent post beta with enough text", ageLabel: "1 mo" },
      ],
      now: NOW,
    });
    assert.equal(a.tier, "active");
    assert.equal(a.recentPostCount, 2);
    assert.ok(a.score != null && a.score >= 80);
  });

  it("returns unknown without posts capture", () => {
    const a = computeLinkedInActivity({
      hasPostsCapture: false,
      now: NOW,
    });
    assert.equal(a.tier, "unknown");
    assert.equal(a.score, null);
  });

  it("classifies dormant on empty feed after capture", () => {
    const a = computeLinkedInActivity({
      hasPostsCapture: true,
      postsCapturedAt: NOW.toISOString(),
      profilePosts: [],
      now: NOW,
    });
    assert.equal(a.tier, "dormant");
    assert.ok(a.score != null);
  });

  it("classifies occasional with one recent post", () => {
    const a = computeLinkedInActivity({
      hasPostsCapture: true,
      postsCapturedAt: NOW.toISOString(),
      profilePosts: [
        { text: "Single recent post with enough text", ageLabel: "5 mo" },
      ],
      now: NOW,
    });
    assert.equal(a.tier, "occasional");
    assert.equal(a.recentPostCount, 1);
  });
});

describe("activityTierAllowsEngage", () => {
  it("allows active and occasional only", () => {
    assert.equal(activityTierAllowsEngage("active"), true);
    assert.equal(activityTierAllowsEngage("occasional"), true);
    assert.equal(activityTierAllowsEngage("lurker"), false);
    assert.equal(activityTierAllowsEngage("dormant"), false);
    assert.equal(activityTierAllowsEngage("unknown"), false);
  });
});
