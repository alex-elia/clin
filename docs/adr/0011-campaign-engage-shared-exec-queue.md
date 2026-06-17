# ADR-0011: Campaign engage path reuses cleaning exec queue

## Status

Accepted

## Context

Campaign ICP checks could recommend **draft outreach** (`keep_and_draft`) but not a structured **engage via comment** path. Cleaning already had `engage_comment` buckets, AI comment generation (`cleaning_engage_comment`), and a paced **`cleaning_exec_queue`** (`kind: engage` | `removal`) consumed by the extension.

Users need nurture contacts in campaigns to get the same comment workflow as Cleaning — without a second queue, pacing system, or extension runner.

## Decision

1. Extend campaign ICP `recommended_action` with **`engage_comment`** (partial/nurture fit + recent post hook; comment before cold DM).
2. Add campaign member status **`engage`** (engage queued) and workflow phase **`engage_queued`** — informational; **does not block** DM draft or **Ready for extension** (parallel paths).
3. Implement **`enqueueCampaignEngage`** (`campaignEngageQueue.ts`): generate comment with optional **campaign context**, enqueue `cleaning_exec_queue` with `payload.source = "campaign"`, `campaignId`, `memberId`.
4. **Orchestrate campaign** and **post-capture workflow** auto-queue engage when ICP returns `engage_comment` (requires recent post capture for auto path; manual **Queue engage** can proceed without).
5. On extension **engage ack** `commented`: reset member status `engage` → `draft` only when still `engage` (preserve `ready` if user already approved DM handoff).

## Consequences

- **Positive:** One engage todo list (Cleaning exec panel + extension popup); campaign is where decisions happen, shared queue is where execution happens.
- **Positive:** Users can queue a public comment and still draft / approve a private DM in parallel.
- **Negative:** Member `status` alone does not tell the full story when `ready` + pending engage exec — UI shows **engage pending** badge from queue lookup.
- **Operational:** Engage quality depends on **posts capture** and post-origin metadata (`postKind`, recency ≤ 1 year).

## Related

- [SPEC-0001](../specifications/SPEC-0001-clin-system-specification.md) §4.2, §4.6, §4.8
- [SPEC-0006](../specifications/SPEC-0006-cleaning-exec-campaign-engage.md)
- [ADR-0010](./0010-unified-contact-analysis-playbook.md)
