# ADR-0012: LinkedIn activity scoring (deterministic helper)

## Status

Accepted

## Context

Clin captures `profilePosts[]` on the posts activity page and filters posts older than 365 days for prompts, but **posting activity was not a ranked signal**:

- Rule **R-score** uses `lastSeenAt` (when Clin captured), not when the contact posted on LinkedIn.
- `posts_depth` in the context bundle is coarse (`missing` / `thin` / `ok`).
- Campaign engage gating was binary: any recent post vs none.

Contacts with no posts or only stale posts (>1 year) are common; the product needed a deterministic tier to rank Cleaning buckets and deprioritize low-activity personas in Campaigns without adding a separate LLM worker.

## Decision

### 1. Deterministic module (`linkedinActivity.ts`)

Compute a **tier** and **0–100 score** from the latest `page_type: posts` capture:

| Tier | Meaning |
|------|---------|
| `active` | 2+ recent posts (≤365d), or 1 post within ~90d |
| `occasional` | 1 recent post within 365d |
| `lurker` | Posts captured but all stale |
| `dormant` | Posts page captured with empty visible feed |
| `unknown` | No posts capture — **never penalize** |

Extend `profilePostRecency.ts` with `estimatePostAgeDays` and `sortPostsByEstimatedAge` so recency picks the **newest** post, not DOM order.

### 2. Persist on `contacts` (optional SQLite columns)

`activity_tier`, `activity_score`, `activity_computed_at`, `newest_post_age_label` — added via `repairSqlite.ts`, read/written through `contactActivitySqlExtras.ts`.

**Write points:** posts ingest, `executeContactAnalysis` (recompute if posts newer), `POST /api/scores/recompute` backfill.

Bump `SCORE_RULE_VERSION` to `"2"`; lurker/dormant cap business score in `scoreContact()`.

### 3. Integrate existing analysis (no new worker)

- `ContactContextBundle.activity` + `LINKEDIN_ACTIVITY` / `rule_activity` in LLM payloads.
- `contact_analyze` schema adds optional `activity_validation`; prompt steers lurker/dormant away from `reach_out` / `engage_comment`.
- Cleaning: bucket guards, blended sort (`composite * 0.7 + activity * 0.3`), low-activity filter.
- Campaigns: ICP prompt + post-process cap; engage queue requires activity score threshold.

### 4. Explicitly deferred (v1)

- Batch `activity_rescore` job for age-label drift without re-capture.
- Extension improvements (post URLs, reactions, capture-failed vs empty feed).

## Consequences

- **Pros:** Queryable ranking, consistent across Cleaning/Campaigns, no extra LLM call, unknown tier avoids false negatives before posts enrich.
- **Cons:** Age labels are approximate; empty-feed dormant may conflate privacy with inactivity until extension distinguishes capture failure.

## Related

- [SPEC-0005](../specifications/SPEC-0005-unified-contact-analysis.md) §3.3
- [ADR-0010](./0010-unified-contact-analysis-playbook.md)
