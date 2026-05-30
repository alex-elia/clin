# ADR-0007: Content calendar, Brand Coach, and extension publish handoff

## Status

Accepted

## Context

Personal branding in Clin already covers **voice** (`user_context`, global writer on `/me`) and **read-only analytics** (`extension_snapshots` with `linkedin_post_analytics_visible`). Users plan LinkedIn posts in external tools (e.g. Perplexity) with multi-turn coaching: raw ideas → polished copy, risk notes, pipeline rescheduling after publish, and format advice (feed vs article).

We need a **local-first editorial calendar** inside Clin with:

- Idea capture, drafting, scheduling, status workflow
- **Brand Coach** — multi-turn LLM that knows author context and can propose structured updates to posts and the pipeline
- **Extension handoff** — copy-ready posts in the Chrome popup (human publishes on LinkedIn; Clin does not post)

Constraints from existing ADRs:

- ADR-0001: extension ↔ HTTP ↔ SQLite; no server-side LinkedIn scraping for posts
- ADR-0005: all LLM via `completeChat` / `getLlmConfig`
- ADR-0006: single-user local app; no multi-tenant author model

## Decision

1. Add **`content_posts`** — one row per planned or published piece (idea → drafting → review → ready → published | archived). Formats: `feed`, `article`, `carousel`, `poll`. Optional `articleBody`, teaser link, `mediaJson`, `coachFlags`.

2. Add **`content_brand_context`** (singleton `id = default`) — `contentDoctrine`, `expertiseSummary`, `publishingRhythm` (JSON), `stanceNotes` for Coach-specific planning knowledge beyond `/me`.

3. Add **`content_ai_threads`** and **`content_ai_messages`** — persist Brand Coach conversations (`scope`: `studio` | `post`).

4. **Brand Coach** (`POST /api/branding/coach`) assembles context from `/me`, brand context, pipeline snapshot, recent publishes, analytics top posts; returns assistant text plus optional **`actions`** JSON (`update_post`, `create_post`, `reschedule_pipeline`, `mark_published`, `suggest_doctrine`). User **applies** actions via server actions (no auto-apply on calendar mutations in v1).

5. **Extension** — `GET /api/branding/posts/ready` lists `status=ready` posts; popup copies `hook` + `body`; mark published via API.

6. **UI** — `/branding/calendar` (month + pipeline table + board), `/branding/studio`, `/branding/posts/[id]`. Field-level copy assistant remains for single-field edits (`post_hook`, `post_body`, etc.).

## Consequences

- **Positive:** Replaces external planning threads; pipeline and voice stay in one DB; reuses outreach handoff pattern.
- **Negative:** Coach quality depends on local LLM; structured action parsing may need prompt tuning.
- **Operational:** Run `npm run db:push` or `npm run db:repair` after deploy; Ollama required for Coach features.

## Alternatives considered

- **Separate `content_ideas` table** — rejected; single `content_posts` entity with `status=idea` simplifies calendar and Coach tools.
- **Kanban-only UI** — rejected; hybrid calendar + board + pipeline table matches user workflow.
- **Auto-apply Coach reschedules** — rejected for v1; explicit Apply reduces surprise mutations.
