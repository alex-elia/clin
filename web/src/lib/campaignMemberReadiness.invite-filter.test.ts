import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  enrichedMemberMatchesFilter,
  type EnrichedCampaignMember,
} from "./campaignMemberReadiness";

function member(input: {
  status: string;
  outreachStep?: string | null;
  draftInviteNote?: string | null;
  draftOutreach?: string | null;
  connectionAcceptedAt?: Date | null;
  connectionDegree?: string | null;
  icpMatch?: "strong" | "partial" | "weak" | "unknown" | null;
}): EnrichedCampaignMember {
  const now = new Date();
  return {
    member: {
      id: "m1",
      campaignId: "c1",
      contactId: "p1",
      status: input.status,
      outreachStep: input.outreachStep ?? "followup",
      draftInviteNote: input.draftInviteNote ?? null,
      draftOutreach: input.draftOutreach ?? null,
      connectionAcceptedAt: input.connectionAcceptedAt ?? null,
      inviteSentAt: null,
      icpMatch: null,
      icpRationale: null,
      icpRecommendedAction: null,
      icpCheckedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    contact: {
      id: "p1",
      fullName: "Pat",
      headline: null,
      company: null,
      location: null,
      linkedinUrlCanonical: "https://www.linkedin.com/in/pat",
      connectionDegree: input.connectionDegree ?? null,
      lastUpdatedAt: now,
    } as EnrichedCampaignMember["contact"],
    profileDepth: "ok",
    lastProfileCapturedAt: now,
    icpMatch: input.icpMatch === undefined ? "strong" : input.icpMatch,
    icpRationale: null,
    icpRecommendedAction: null,
    icpCheckedAt: now,
    activityTier: null,
    activityScore: null,
    newestPostAgeLabel: null,
  } as EnrichedCampaignMember;
}

describe("invite workflow member filters", () => {
  it("puts unknown and 2nd-degree people on the invite step", () => {
    const unknown = member({ status: "draft", connectionDegree: null });
    const second = member({ status: "draft", connectionDegree: "2nd" });
    const first = member({ status: "draft", connectionDegree: "1st" });
    assert.equal(enrichedMemberMatchesFilter(unknown, "invite_step"), true);
    assert.equal(enrichedMemberMatchesFilter(second, "invite_step"), true);
    assert.equal(enrichedMemberMatchesFilter(first, "invite_step"), false);
    assert.equal(enrichedMemberMatchesFilter(unknown, "need_invite"), true);
    assert.equal(enrichedMemberMatchesFilter(first, "need_invite"), false);
  });

  it("keeps Need invite note to strong or partial ICP only", () => {
    const weak = member({
      status: "draft",
      connectionDegree: "2nd",
      icpMatch: "weak",
    });
    const unknownIcp = member({
      status: "draft",
      connectionDegree: "2nd",
      icpMatch: "unknown",
    });
    const unchecked = member({
      status: "draft",
      connectionDegree: "2nd",
      icpMatch: null,
    });
    const partial = member({
      status: "draft",
      connectionDegree: "2nd",
      icpMatch: "partial",
    });
    assert.equal(enrichedMemberMatchesFilter(weak, "need_invite"), false);
    assert.equal(enrichedMemberMatchesFilter(unknownIcp, "need_invite"), false);
    assert.equal(enrichedMemberMatchesFilter(unchecked, "need_invite"), false);
    assert.equal(enrichedMemberMatchesFilter(partial, "need_invite"), true);
    assert.equal(enrichedMemberMatchesFilter(weak, "invite_step"), true);
  });

  it("filters ready-to-invite vs invite-sent vs follow-up", () => {
    const readyInvite = member({
      status: "ready",
      outreachStep: "invite",
      draftInviteNote: "Hello",
      connectionDegree: "2nd",
    });
    const sent = member({
      status: "invite_sent",
      outreachStep: "invite",
      draftInviteNote: "Hello",
      connectionDegree: "2nd",
    });
    const followup = member({
      status: "followup_ready",
      outreachStep: "followup",
      draftOutreach: "Thanks for connecting",
      connectionDegree: "1st",
      connectionAcceptedAt: new Date(),
    });
    assert.equal(enrichedMemberMatchesFilter(readyInvite, "invite_ready"), true);
    assert.equal(enrichedMemberMatchesFilter(sent, "awaiting_connection"), true);
    assert.equal(enrichedMemberMatchesFilter(sent, "need_invite"), false);
    assert.equal(enrichedMemberMatchesFilter(followup, "followup_ready"), true);
    assert.equal(enrichedMemberMatchesFilter(followup, "invite_step"), false);
  });

  it("puts a drafted invite note in review_invite, not ready or need_invite", () => {
    const drafted = member({
      status: "draft",
      outreachStep: "invite",
      draftInviteNote: "Hello from the campaign",
      connectionDegree: "2nd",
    });
    assert.equal(enrichedMemberMatchesFilter(drafted, "need_invite"), false);
    assert.equal(enrichedMemberMatchesFilter(drafted, "review_invite"), true);
    assert.equal(enrichedMemberMatchesFilter(drafted, "invite_ready"), false);
    assert.equal(enrichedMemberMatchesFilter(drafted, "review_draft"), true);
  });
});
