import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeConnectionDegree,
  parseConnectionDegree,
  resolveDegreeFromCaptures,
} from "./connectionDegree";

describe("parseConnectionDegree", () => {
  it("parses English and French labels", () => {
    assert.equal(parseConnectionDegree("1st"), "1st");
    assert.equal(parseConnectionDegree("1er"), "1st");
    assert.equal(parseConnectionDegree("2e"), "2nd");
    assert.equal(parseConnectionDegree("3rd+"), "3rd+");
    assert.equal(parseConnectionDegree("3e"), "3rd+");
  });

  it("returns null for empty or unknown text", () => {
    assert.equal(parseConnectionDegree(""), null);
    assert.equal(parseConnectionDegree("CEO"), null);
  });
});

describe("normalizeConnectionDegree", () => {
  it("passes through normalized values", () => {
    assert.equal(normalizeConnectionDegree("2nd"), "2nd");
  });

  it("normalizes raw French labels", () => {
    assert.equal(normalizeConnectionDegree("1er degré"), "1st");
  });
});

describe("resolveDegreeFromCaptures", () => {
  it("prefers connections list capture", () => {
    const d = resolveDegreeFromCaptures([
      {
        pageType: "profile",
        extractedJson: JSON.stringify({ connectionDegree: "2nd" }),
      },
      {
        pageType: "connections",
        extractedJson: JSON.stringify({}),
      },
    ]);
    assert.equal(d, "1st");
  });

  it("reads degree from profile capture json", () => {
    const d = resolveDegreeFromCaptures([
      {
        pageType: "profile",
        extractedJson: JSON.stringify({ connectionDegree: "1er" }),
      },
    ]);
    assert.equal(d, "1st");
  });
});
