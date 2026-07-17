import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripLinkedInLetterSignOff } from "./linkedinPostClipboard";
import {
  applySenderNameToDraft,
  stripSenderSignatureFromDraft,
} from "./senderIdentity";

describe("stripSenderSignatureFromDraft", () => {
  const sender = {
    fullName: "Alexandre GON",
    headline: "Founder",
    company: "Elia",
  };

  it("removes Cordialement + full name", () => {
    const input =
      "Bonjour Marie,\n\nContent de connecter sur le sujet FinOps.\n\nCordialement,\nAlexandre GON";
    assert.equal(
      stripSenderSignatureFromDraft(input, sender),
      "Bonjour Marie,\n\nContent de connecter sur le sujet FinOps.",
    );
  });

  it("removes trailing full name alone", () => {
    assert.equal(
      stripSenderSignatureFromDraft(
        "Thanks for sharing your view on sovereignty.\n\nAlexandre GON",
        sender,
      ),
      "Thanks for sharing your view on sovereignty.",
    );
  });

  it("applySenderNameToDraft clears placeholders instead of filling them", () => {
    assert.equal(
      applySenderNameToDraft("Hello — [Your Name]", sender),
      "Hello —",
    );
  });
});

describe("stripLinkedInLetterSignOff", () => {
  it("strips Best regards + name from post body", () => {
    const body =
      "Cloud bills hide in plain sight.\n\nWhat do you audit first?\n\nBest regards,\nAlexandre GON";
    assert.equal(
      stripLinkedInLetterSignOff(body),
      "Cloud bills hide in plain sight.\n\nWhat do you audit first?",
    );
  });
});
