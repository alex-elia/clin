import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MESSAGING_CAPTURE_SQL } from "./messagingCaptureFlags";

describe("messagingCaptureFlags", () => {
  it("matches messaging page type and messaging URLs", () => {
    assert.match(MESSAGING_CAPTURE_SQL, /page_type = 'messaging'/);
    assert.match(MESSAGING_CAPTURE_SQL, /\/messaging\//);
  });
});
