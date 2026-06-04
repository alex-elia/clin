/** Client-safe — motion labels and playbook text for thread analysis prompts. */

export type SalesMotion =
  | "b2b_saas"
  | "services_agency"
  | "recruiting"
  | "fundraising_investor"
  | "generic_b2b";

export const SALES_MOTION_LABELS: Record<SalesMotion, string> = {
  b2b_saas: "B2B SaaS / product",
  services_agency: "Services / agency",
  recruiting: "Recruiting / talent",
  fundraising_investor: "Fundraising / investor relations",
  generic_b2b: "General B2B",
};

const MOTION_SIGNALS: { motion: SalesMotion; patterns: RegExp[] }[] = [
  {
    motion: "b2b_saas",
    patterns: [
      /\bsaas\b/i,
      /\bsoftware\b/i,
      /\bplatform\b/i,
      /\bproduct\b/i,
      /\bapi\b/i,
      /\bdemo\b/i,
      /\btrial\b/i,
      /\barr\b/i,
      /\bmrr\b/i,
    ],
  },
  {
    motion: "services_agency",
    patterns: [
      /\bagency\b/i,
      /\bconsult/i,
      /\bservices?\b/i,
      /\bfreelanc/i,
      /\bstudio\b/i,
      /\bimplementation\b/i,
      /\badvisory\b/i,
    ],
  },
  {
    motion: "recruiting",
    patterns: [
      /\brecruit/i,
      /\btalent\b/i,
      /\bhiring\b/i,
      /\bheadhunt/i,
      /\bstaffing\b/i,
      /\bcandidate\b/i,
      /\brole\b/i,
    ],
  },
  {
    motion: "fundraising_investor",
    patterns: [
      /\binvestor\b/i,
      /\bfundraising\b/i,
      /\bvc\b/i,
      /\bventure\b/i,
      /\blp\b/i,
      /\bcapital\b/i,
      /\bportfolio\b/i,
    ],
  },
];

const PLAYBOOKS: Record<SalesMotion, string[]> = {
  b2b_saas: [
    "Qualify pain and timeline before feature talk — one sharp question beats a pitch.",
    "Use at most one proof point (customer type, outcome, or metric) tied to their situation.",
    "Prefer a short call or demo over long DM threads; DMs should earn the meeting.",
    "If they are vague, propose a 15–20 min call with a clear agenda — not a deck dump.",
    "Do not hard-close in chat; match urgency to buying signals, not your quota.",
  ],
  services_agency: [
    "Lead with their context and a specific observation from profile or thread — not your full offer.",
    "Offer a low-friction next step: quick audit, sample, intro call, or scoped question.",
    "Price and scope belong on a call — DMs establish fit and curiosity.",
    "If they ghosted after interest, one polite bump with new value — then stop.",
  ],
  recruiting: [
    "Respect their time — clear role, company, and why them in the first lines.",
    "Make yes/no easy; avoid vague 'catch up' without a hook.",
    "If they declined or went silent, do not re-pitch the same role — one graceful close.",
  ],
  fundraising_investor: [
    "Be concise on traction, market, and ask — investors skim.",
    "If they asked for materials, confirm what to send; do not overshare in DM.",
    "Warm intros beat cold pushes — suggest the lowest-friction next step.",
  ],
  generic_b2b: [
    "One thread goal: clarify intent, advance one step, or close politely.",
    "Mirror their tone; avoid corporate filler and bracket placeholders.",
    "When they replied, answer their question first — then one CTA aligned with campaign context.",
    "Protect reputation: no double messages, no guilt trips, no fake urgency.",
  ],
};

export type PlaybookInput = {
  positioningSummary?: string | null;
  goalsText?: string | null;
  campaignContextText?: string | null;
  campaignIcpText?: string | null;
  contactHeadline?: string | null;
  contactCompany?: string | null;
};

function scoreMotion(text: string, motion: SalesMotion): number {
  const entry = MOTION_SIGNALS.find((m) => m.motion === motion);
  if (!entry) return 0;
  let score = 0;
  for (const re of entry.patterns) {
    if (re.test(text)) score += 1;
  }
  return score;
}

/** Pick a sales motion from owner + campaign text (deterministic, no LLM). */
export function inferSalesMotion(input: PlaybookInput): SalesMotion {
  const blob = [
    input.positioningSummary,
    input.goalsText,
    input.campaignContextText,
    input.campaignIcpText,
    input.contactHeadline,
    input.contactCompany,
  ]
    .filter(Boolean)
    .join("\n");

  if (!blob.trim()) return "generic_b2b";

  let best: SalesMotion = "generic_b2b";
  let bestScore = 0;
  for (const { motion } of MOTION_SIGNALS) {
    const s = scoreMotion(blob, motion);
    if (s > bestScore) {
      bestScore = s;
      best = motion;
    }
  }
  return bestScore > 0 ? best : "generic_b2b";
}

export function buildSalesCoachPlaybookBlock(
  motion: SalesMotion,
): string {
  const label = SALES_MOTION_LABELS[motion];
  const rules = PLAYBOOKS[motion];
  return [
    `Sales coach playbook (${label}):`,
    ...rules.map((r) => `- ${r}`),
  ].join("\n");
}
