import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleaningCanDisconnect,
  cleaningNeedsInvite,
  cleaningNetworkLabel,
} from "./cleaningNetwork";

describe("cleaningNetwork", () => {
  it("allows disconnect only for 1st degree", () => {
    assert.equal(cleaningCanDisconnect("1st"), true);
    assert.equal(cleaningCanDisconnect("2nd"), false);
    assert.equal(cleaningCanDisconnect("3rd+"), false);
    assert.equal(cleaningCanDisconnect(null), false);
  });

  it("treats unknown and 2nd/3rd as invite-first", () => {
    assert.equal(cleaningNeedsInvite("1st"), false);
    assert.equal(cleaningNeedsInvite("2nd"), true);
    assert.equal(cleaningNeedsInvite(null), true);
    assert.equal(cleaningNetworkLabel("2e"), "2nd");
    assert.equal(cleaningNetworkLabel(null), "unknown");
  });
});
