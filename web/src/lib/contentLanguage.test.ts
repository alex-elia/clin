import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveOutreachLanguage,
  buildOutreachFormattingInstruction,
} from "./contentLanguage";

describe("resolveOutreachLanguage", () => {
  it("uses English from a short English headline instead of defaulting to French", () => {
    const r = resolveOutreachLanguage({
      brandPreference: "auto",
      marketRegion: "fr",
      recipientContext: "VP Sales at Acme",
    });
    assert.equal(r.language, "en");
    assert.equal(r.source, "detected_post");
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

  it("lets recipient English win over a French brand default", () => {
    const r = resolveOutreachLanguage({
      brandPreference: "fr",
      marketRegion: "en",
      recipientContext: "Head of Engineering in Berlin",
    });
    assert.equal(r.language, "en");
    assert.equal(r.source, "detected_post");
  });

  it("lets a French location beat an English CEO headline", () => {
    const r = resolveOutreachLanguage({
      brandPreference: "en",
      marketRegion: "en",
      recipientContext: "CEO and Founder\nParis, France",
    });
    assert.equal(r.language, "fr");
  });

  it("locks French from short campaign instructions", () => {
    const r = resolveOutreachLanguage({
      brandPreference: "en",
      marketRegion: "en",
      campaignWriterInstructions: "Notes d'invitation en français.",
      recipientContext: "Head of Sales at Acme",
    });
    assert.equal(r.language, "fr");
    assert.equal(r.source, "campaign");
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
