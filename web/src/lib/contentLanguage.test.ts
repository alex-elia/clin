import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveOutreachLanguage,
  buildOutreachFormattingInstruction,
} from "./contentLanguage";

describe("resolveOutreachLanguage", () => {
  it("defaults to French for FR market when signals are thin", () => {
    const r = resolveOutreachLanguage({
      brandPreference: "auto",
      marketRegion: "fr",
      recipientContext: "VP Sales at Acme",
    });
    assert.equal(r.language, "fr");
  });

  it("detects French from recipient profile text", () => {
    const r = resolveOutreachLanguage({
      brandPreference: "auto",
      marketRegion: "fr",
      recipientContext:
        "Directeur des opérations chez une entreprise à Paris. Nous accompagnons les équipes avec des solutions pour améliorer la performance.",
    });
    assert.equal(r.language, "fr");
    assert.equal(r.source, "detected_post");
  });

  it("respects explicit brand French preference", () => {
    const r = resolveOutreachLanguage({
      brandPreference: "fr",
      marketRegion: "en",
      recipientContext: "CEO at startup",
    });
    assert.equal(r.language, "fr");
    assert.equal(r.source, "brand");
  });
});

describe("buildOutreachFormattingInstruction", () => {
  it("emphasizes paragraphs when user asked for line breaks", () => {
    const block = buildOutreachFormattingInstruction(
      "Use short paragraphs with line breaks between ideas.",
    );
    assert.match(block, /paragraph/i);
    assert.match(block, /\\n\\n/);
  });
});
