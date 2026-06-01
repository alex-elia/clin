# SPEC-0004: Editorial autopilot (jobs, sources, market calendar)

**Status:** As-built  
**Related:** [ADR-0008](../adr/0008-editorial-autopilot-jobs-sources.md), [SPEC-0002](./SPEC-0002-content-calendar-brand-coach.md)

## 1. Purpose

Extend Clin branding with durable editorial jobs, market calendar context, content sources (including trends), and a portable job runner for local CLI and future cloud tick.

## 2. Data model

### 2.1 `content_brand_context` (extended)

| Field | Type | Notes |
|-------|------|-------|
| `marketRegion` | text | `fr` \| `eu` \| `us` \| `custom` |
| `planningHorizonDays` | int | 7, 14, or 30 |
| `editorialAutopilotEnabled` | bool | Master switch |
| `editorialAutopilotPolicy` | json | See ADR-0008 |

### 2.2 `content_posts` (extended)

| Field | Notes |
|-------|-------|
| `sourceItemIds` | json string[] |
| `planningWeek` | ISO week label |

### 2.3 `content_sources`

| Field | Notes |
|-------|-------|
| `type` | `rss` \| `url` \| `paste` \| `search_digest` \| `trend_digest` |
| `configJson` | adapter-specific |
| `enabled`, `fetchIntervalHours`, `lastFetchedAt`, `lastError` | |

### 2.4 `content_source_items`

| Field | Notes |
|-------|-------|
| `itemKind` | `article` \| `trend_topic` \| `paste` |
| `trendScore`, `publishedAt`, `usedAt`, `dismissedAt` | curation |

### 2.5 `editorial_jobs`

| Field | Notes |
|-------|-------|
| `type` | `ingest_sources` \| `ingest_trends` \| `plan_horizon` \| `draft_post` \| `review_digest` |
| `status` | `pending` \| `running` \| `done` \| `failed` \| `cancelled` |
| `runAfter`, `lockedUntil`, `attempts`, `payloadJson` | |

## 3. HTTP API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/branding/jobs/tick` | Process due jobs (session or `BRANDING_TICK_SECRET`) |
| GET | `/api/branding/sources` | List sources |
| POST | `/api/branding/sources` | Create/update source |
| GET | `/api/branding/trends` | Trend inbox |
| POST | `/api/branding/trends/refresh` | Enqueue `ingest_trends` |
| POST | `/api/branding/trends/[id]/use` | Mark used; optional idea post |

## 4. CLI

`npm run branding:tick` — runs DB repair, then `runEditorialJobTick` via tsx.

## 5. Orchestration

- **ingest_sources / ingest_trends:** `SourceFetcher` → dedupe → `content_source_items`
- **plan_horizon:** coach studio turn with calendar + trend inbox context → `applyCoachActions` + `maxPostsPerWeek` trim
- **draft_post:** `runPostAutopilotServer` → `status=review` (or `ready` if policy allows)

## 6. Security

- `TAVILY_API_KEY`, optional `BRANDING_TICK_SECRET` in env only
- No LinkedIn source crawl
