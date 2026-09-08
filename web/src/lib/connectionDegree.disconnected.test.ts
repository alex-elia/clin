import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DISCONNECTED_DEGREE,
  isDisconnectedDegree,
  normalizeConnectionDegree,
} from "@/lib/connectionDegree";

describe("connectionDegree disconnected", () => {
  it("recognizes disconnected sentinel", () => {
    assert.equal(isDisconnectedDegree("disconnected"), true);
    assert.equal(isDisconnectedDegree("1st"), false);
  });

  it("does not normalize disconnected as a LinkedIn degree", () => {
    assert.equal(normalizeConnectionDegree(DISCONNECTED_DEGREE), null);
  });
});
