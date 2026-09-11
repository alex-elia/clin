import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractBalancedJsonObject,
  parseModelJsonObject,
} from "@/lib/llmAnalysis";

describe("parseModelJsonObject", () => {
  it("parses JSON after reasoning preamble", () => {
    const parsed = parseModelJsonObject(
      `We need answer user's request: produce single JSON object no markdown.\n{"scores":{"r":70,"b":65,"c":10},"rationale":{"relationship":"x","business":"y","cleanup":"z"},"suggested_actions":["none"],"cleaning_plan":{"bucket":"needs_review","confidence":"medium","rationale":"test"}}`,
    ) as { scores: { r: number } };
    assert.equal(parsed.scores.r, 70);
  });

  it("repairs truncated closing braces", () => {
    const raw =
      '{"scores":{"r":70,"b":65,"c":10},"rationale":{"relationship":"x"';
    const balanced = extractBalancedJsonObject(raw);
    assert.ok(balanced);
    const parsed = parseModelJsonObject(raw) as { scores: { c: number } };
    assert.equal(parsed.scores.c, 10);
  });

  it("salvages truncated mid-key contact JSON", () => {
    const raw = '{ "scores": { "r": 70, "b": 65, "c": 10 }, "rational';
    const parsed = parseModelJsonObject(raw) as {
      scores: { r: number; c: number };
      cleaning_plan: { bucket: string };
    };
    assert.equal(parsed.scores.r, 70);
    assert.equal(parsed.scores.c, 10);
    assert.equal(parsed.cleaning_plan.bucket, "needs_review");
  });
});
