import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { capturePayloadSchema } from "./schemas";
import { sanitizeCapturePayload } from "./capturePayloadSanitize";

describe("sanitizeCapturePayload", () => {
  it("truncates long experience bullets before validation", () => {
    const body = {
      schemaVersion: "1",
      pageType: "profile",
      sourceUrl: "https://www.linkedin.com/in/jovan-garic",
      extractedFields: {
        fullName: "Jovan Garic",
        experienceBullets: ["x".repeat(700)],
      },
    };
    const parsed = capturePayloadSchema.safeParse(sanitizeCapturePayload(body));
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.ok(
        (parsed.data.extractedFields.experienceBullets?.[0]?.length ?? 0) <= 600,
      );
    }
  });

  it("fills missing sourceUrl from expectedParticipantProfileUrl", () => {
    const body = {
      schemaVersion: "1",
      pageType: "profile",
      extractedFields: { fullName: "Jovan Garic", headline: "CEO" },
      expectedParticipantProfileUrl: "https://www.linkedin.com/in/jovan-garic",
    };
    const parsed = capturePayloadSchema.safeParse(sanitizeCapturePayload(body));
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(
        parsed.data.sourceUrl,
        "https://www.linkedin.com/in/jovan-garic",
      );
    }
  });
});
