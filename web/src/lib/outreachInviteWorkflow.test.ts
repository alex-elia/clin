import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampInviteNote,
  INVITE_NOTE_MAX_CHARS,
  isInviteNoteTooLong,
  isUsableOutreachCopy,
  memberHasSendableFollowup,
  memberHasSendableInvite,
  needsInviteStep,
  nextMemberStatusAfterSend,
  pickOutreachQueueDecision,
  resolveOutreachAction,
} from "./outreachInviteWorkflow";

describe("invite note length", () => {
  it("clamps notes over the free LinkedIn limit", () => {
    const long = "a".repeat(INVITE_NOTE_MAX_CHARS + 40);
    const clamped = clampInviteNote(long);
    assert.equal(clamped.length, INVITE_NOTE_MAX_CHARS);
    assert.equal(isInviteNoteTooLong(long), true);
    assert.equal(isInviteNoteTooLong("short note"), false);
  });

  it("treats ellipsis placeholders as empty", () => {
    assert.equal(isUsableOutreachCopy("..."), false);
    assert.equal(isUsableOutreachCopy("Hi there"), true);
  });
});

describe("needsInviteStep", () => {
  it("is true unless the contact is a known 1st degree", () => {
    assert.equal(needsInviteStep("2nd"), true);
    assert.equal(needsInviteStep("2e"), true);
    assert.equal(needsInviteStep("3rd+"), true);
    assert.equal(needsInviteStep("1st"), false);
    assert.equal(needsInviteStep(null), true);
  });
});

describe("resolveOutreachAction", () => {
  it("routes ready + invite step to invite", () => {
    assert.equal(
      resolveOutreachAction({
        status: "ready",
        outreachStep: "invite",
        connectionDegree: "2nd",
      }),
      "invite",
    );
  });

  it("routes followup_ready to dm", () => {
    assert.equal(
      resolveOutreachAction({
        status: "followup_ready",
        outreachStep: "followup",
        connectionDegree: "1st",
      }),
      "dm",
    );
  });

  it("routes ready 1st-degree followup to dm", () => {
    assert.equal(
      resolveOutreachAction({
        status: "ready",
        outreachStep: "followup",
        connectionDegree: "1st",
      }),
      "dm",
    );
  });

  it("routes ready non-1st followup step to invite, not DM", () => {
    assert.equal(
      resolveOutreachAction({
        status: "ready",
        outreachStep: "followup",
        connectionDegree: "2nd",
      }),
      "invite",
    );
    assert.equal(
      resolveOutreachAction({
        status: "ready",
        outreachStep: "followup",
        connectionDegree: null,
      }),
      "invite",
    );
  });

  it("returns null for invite_sent", () => {
    assert.equal(
      resolveOutreachAction({
        status: "invite_sent",
        outreachStep: "invite",
        connectionDegree: "2nd",
      }),
      null,
    );
  });
});

describe("sendable members", () => {
  it("requires invite note for invite send", () => {
    assert.equal(
      memberHasSendableInvite({
        status: "ready",
        outreachStep: "invite",
        draftInviteNote: "Hello",
      }),
      true,
    );
    assert.equal(
      memberHasSendableInvite({
        status: "ready",
        outreachStep: "invite",
        draftInviteNote: "  ",
      }),
      false,
    );
  });

  it("accepts followup_ready or ready followup for DM", () => {
    assert.equal(
      memberHasSendableFollowup({
        status: "followup_ready",
        outreachStep: "followup",
        draftOutreach: "Hi there",
      }),
      true,
    );
    assert.equal(
      memberHasSendableFollowup({
        status: "ready",
        outreachStep: "followup",
        draftOutreach: "Hi there",
      }),
      true,
    );
    assert.equal(
      memberHasSendableFollowup({
        status: "ready",
        outreachStep: "invite",
        draftOutreach: "Hi there",
      }),
      false,
    );
  });
});

describe("ack status transitions", () => {
  it("maps invite send to invite_sent and dm send to sent", () => {
    assert.equal(nextMemberStatusAfterSend("invite"), "invite_sent");
    assert.equal(nextMemberStatusAfterSend("dm"), "sent");
  });
});

describe("queue decision", () => {
  it("prefers invite when enabled and a candidate exists", () => {
    const d = pickOutreachQueueDecision({
      inviteEnabled: true,
      dmEnabled: true,
      inviteCapHit: false,
      dmCapHit: false,
      hasInviteCandidate: true,
      hasDmCandidate: true,
    });
    assert.deepEqual(d, { action: "invite" });
  });

  it("falls back to dm when invites are off", () => {
    const d = pickOutreachQueueDecision({
      inviteEnabled: false,
      dmEnabled: true,
      inviteCapHit: false,
      dmCapHit: false,
      hasInviteCandidate: true,
      hasDmCandidate: true,
    });
    assert.deepEqual(d, { action: "dm" });
  });

  it("reports invite cap", () => {
    const d = pickOutreachQueueDecision({
      inviteEnabled: true,
      dmEnabled: false,
      inviteCapHit: true,
      dmCapHit: false,
      hasInviteCandidate: true,
      hasDmCandidate: false,
    });
    assert.deepEqual(d, { reason: "daily_invite_cap" });
  });
});
