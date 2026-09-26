import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractBalancedJsonObject,
  llmAnalysisOutputSchema,
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

  it("maps off-enum post_notes.kind instead of failing analysis", () => {
    const parsed = {
      scores: { r: 70, b: 65, c: 10 },
      posts_signals: {
        post_notes: [
          { kind: "repost", summary: "Shared a peer post" },
          { kind: "article", summary: "Shared an FT piece" },
          { kind: "carousel", summary: "Slide deck" },
        ],
      },
      cleaning_plan: {
        bucket: "nurture_light",
        confidence: "medium",
        rationale: "test",
      },
    };
    const out = llmAnalysisOutputSchema.safeParse(parsed);
    assert.equal(out.success, true);
    if (!out.success) return;
    const notes = out.data.posts_signals?.post_notes ?? [];
    assert.equal(notes[0]?.kind, "reshare");
    assert.equal(notes[1]?.kind, "news_share");
    assert.equal(notes[2]?.kind, "unknown");
  });
});
