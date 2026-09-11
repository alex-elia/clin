import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPlaceholderOutreachMessage,
  parseOutreachDraftMessage,
  responseLooksLikeJsonObject,
} from "./outreachDraftParse";

describe("parseOutreachDraftMessage", () => {
  it("rejects thinking-only replies with no JSON", () => {
    const raw =
      "We need answer user's request. Need produce final strictly valid JSON only. Need write message in English? User says add…";
    assert.equal(parseOutreachDraftMessage(raw), null);
    assert.equal(responseLooksLikeJsonObject(raw), false);
  });

  it("rejects the example ellipsis placeholder", () => {
    assert.equal(parseOutreachDraftMessage('{"message":"..."}'), null);
    assert.equal(isPlaceholderOutreachMessage("..."), true);
  });

  it("reads the note after a reasoning preamble", () => {
    const raw = `We need produce JSON only.\n{"message":"Hi Marie, your work on timber frames caught my eye. Happy to connect."}`;
    assert.equal(
      parseOutreachDraftMessage(raw),
      "Hi Marie, your work on timber frames caught my eye. Happy to connect.",
    );
  });
});
