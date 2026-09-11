import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveTierModelId,
  routeClinFeature,
} from "./llmModelRoute";

describe("routeClinFeature", () => {
  it("sends invite notes and short outreach to the fast slot, not visual", () => {
    const invite = routeClinFeature("outreach_draft", { kind: "invite" });
    assert.equal(invite.tier, "orchestrator");
    const dm = routeClinFeature("outreach_draft", { kind: "followup" });
    assert.equal(dm.tier, "orchestrator");
  });

  it("sends image prompts to visual and campaign prep to reasoning", () => {
    assert.equal(routeClinFeature("post_image_prompt").tier, "visual");
    assert.equal(routeClinFeature("campaign_prep_plan").tier, "reasoning");
  });

  it("keeps typical analysis on the fast slot and upgrades oversized prompts", () => {
    assert.equal(
      routeClinFeature("contact_analyze", { userChars: 9_000 }).tier,
      "orchestrator",
    );
    assert.equal(
      routeClinFeature("campaign_icp_check").tier,
      "orchestrator",
    );
    assert.equal(
      routeClinFeature("contact_analyze", { userChars: 25_000 }).tier,
      "reasoning",
    );
    assert.equal(
      routeClinFeature("inbox_thread_analyze", { userChars: 25_000 }).tier,
      "reasoning",
    );
  });
});

describe("resolveTierModelId", () => {
  it("picks configured slot IDs without baking in a vendor model name", () => {
    const visual = resolveTierModelId("Fast-A", "Reason-B", "visual", "Visual-C");
    assert.equal(visual.model, "Visual-C");
    assert.equal(visual.tier, "visual");
    const invite = resolveTierModelId("Fast-A", "Reason-B", "orchestrator", "Visual-C");
    assert.equal(invite.model, "Fast-A");
    const reason = resolveTierModelId("Fast-A", "Reason-B", "reasoning", "Visual-C");
    assert.equal(reason.model, "Reason-B");
  });

  it("does not use the visual model for the fast slot", () => {
    const invite = resolveTierModelId(
      "Qwen3.8-27B",
      "Reason-B",
      "orchestrator",
      "Qwen3.8-27B",
      "Mistral-Small-3.2-24B-Instruct-2506",
    );
    assert.equal(invite.model, "Mistral-Small-3.2-24B-Instruct-2506");
    assert.equal(invite.tier, "orchestrator");
  });
});
