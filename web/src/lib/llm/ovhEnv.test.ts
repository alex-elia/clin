import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveChatCompletionsUrl } from "./chatCompletionsUrl";
import { resolveOvhApiBaseFromEnv, resolveOvhChatCompletionsUrl } from "./ovhEnv";
import { OVH_AI_DEFAULT_BASE_URL } from "./ovhDefaults";

describe("ovhEnv defaults", () => {
  it("resolves the public OVH chat URL without a circular import", () => {
    assert.equal(typeof OVH_AI_DEFAULT_BASE_URL, "string");
    assert.match(OVH_AI_DEFAULT_BASE_URL, /^https:\/\//);
    assert.equal(resolveOvhApiBaseFromEnv({}), OVH_AI_DEFAULT_BASE_URL);
    assert.equal(
      resolveOvhChatCompletionsUrl({ env: {} }),
      `${OVH_AI_DEFAULT_BASE_URL}/chat/completions`,
    );
    assert.equal(
      resolveChatCompletionsUrl("https://example.test/v1"),
      "https://example.test/v1/chat/completions",
    );
  });
});
