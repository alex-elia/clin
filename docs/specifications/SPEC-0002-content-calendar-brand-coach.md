# SPEC-0002: Content calendar and Brand Coach

**Status:** As-built (initial implementation)  
**Related:** [ADR-0007](../adr/0007-content-calendar-brand-coach.md), [ADR-0005](../adr/0005-unified-llm-inference-layer.md)

## 1. Purpose

Let a Clin user plan, write, and schedule LinkedIn personal-brand posts locally, with an AI coach that knows their voice and can update the editorial pipeline. Publishing remains manual on LinkedIn; the extension provides copy handoff.

## 2. Data model

### 2.1 `content_posts`

| Field | Type | Notes |
|-------|------|-------|
| `id` | text PK | UUID |
| `title` | text | Calendar label |
| `status` | text | `idea` \| `drafting` \| `review` \| `ready` \| `published` \| `archived` |
| `format` | text | `feed` \| `article` \| `carousel` \| `poll` |
| `ideaNotes` | text | Raw curation / voice notes |
| `hook` | text | Opening |
| `body` | text | Feed copy or article teaser |
| `articleBody` | text | Long form when `format=article` |
| `linkedTeaserPostId` | text FK | Optional pair |
| `styleNotes` | text | Hashtags, structure |
| `mediaJson` | json | `{ items: [{ kind, url?, note?, alt? }] }` |
| `coachFlags` | json | e.g. `{ fakeQuoteRisk: true }` |
| `lastCoachSummary` | text | Short chip label |
| `scheduledAt` | ms | Nullable |
| `readyAt` | ms | Nullable |
| `publishedAt` | ms | Nullable |
| `sourceAnalyticsSnapshotId` | text | Optional |
| `createdAt`, `updatedAt` | ms | |

### 2.2 `content_brand_context` (singleton `default`)

| Field | Purpose |
|-------|---------|
| `contentDoctrine` | Reusable principles (6-bullet style) |
| `expertiseSummary` | Role / expertise for Coach |
| `publishingRhythm` | JSON: `preferredWeekdays`, `timeWindow`, `maxPostsPerWeek` |
| `stanceNotes` | Critical-analysis stance |

### 2.3 `content_ai_threads` / `content_ai_messages`

- Thread: `scope` (`studio` \| `post`), optional `postId`, `title`
- Message: `role` (`user` \| `assistant`), `content`, optional `actionsJson`

## 3. HTTP API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/branding/posts/ready` | Extension: ready posts with hook/body |
| POST | `/api/branding/coach` | `{ threadId?, postId?, message }` → `{ reply, threadId, actions? }` |
| POST | `/api/branding/coach/apply` | `{ actions: CoachAction[] }` → apply results |
| POST | `/api/extension/branding-post-published` | `{ postId }` → mark published |

## 4. Server actions

- `saveContentPostAction`, `createContentPostAction`, `updateContentPostStatusAction`, `scheduleContentPostAction`, `markContentPostReadyAction`, `markContentPostPublishedAction`, `archiveContentPostAction`
- `saveContentBrandContextAction`
- `applyCoachActionsAction`

## 5. Brand Coach behavior

**Context:** `user_context`, global writer, `content_brand_context`, all non-archived posts (summary), last 5 published, top 3 analytics posts, active post full text when scoped.

**System rules:** French-friendly B2B practitioner tone; challenge fake quotes; prefer concrete hooks; respect publishing rhythm; feed vs article advice; no claim of posting to LinkedIn.

**Actions:** Parsed from trailing ` ```coach-actions` JSON block in model output.

## 6. UI routes

| Route | Function |
|-------|----------|
| `/branding` | Hub |
| `/branding/calendar` | Month grid, pipeline table, board |
| `/branding/studio` | Global Coach |
| `/branding/posts/new`, `/branding/posts/[id]` | Editor + Coach panel |

## 7. Extension

New **Branding** panel section: refresh ready posts, copy post text, mark published.

## 8. Post images (Stability AI)

Same official API as nemrut (`STABILITY_API_KEY`, optional `STABILITY_SD3_URL`, `STABILITY_SD3_MODEL`).

- Settings: enable, endpoint, model, API key (or env `STABILITY_API_KEY`)
- `POST /api/branding/generate-image` → SD3 JPEG saved under `data/media/posts/`

## 9. Out of scope (v1)

- LinkedIn composer DOM fill for posts
- Local Automatic1111 WebUI
- Auto-apply Coach pipeline changes without user confirmation
