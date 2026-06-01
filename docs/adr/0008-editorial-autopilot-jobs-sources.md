# ADR-0008: Editorial autopilot — job queue, sources, and portable runners

## Status

Accepted

## Context

Clin’s Brand Coach and post autopilot ([ADR-0007](./0007-content-calendar-brand-coach.md)) work well interactively but lack:

- Configurable **planning horizon** and **market calendar** context for studio planning
- **Source curation** (RSS, paste, optional web discovery) feeding planning and post briefs
- **Scheduled execution** without relying on naive cron (overlap, no resume, dev server must stay up)

Constraints:

- ADR-0001: no LinkedIn crawl for source material
- ADR-0005: LLM via `completeChat`
- ADR-0006: single SQLite writer; local dev lock file
- ADR-0007: human publishes; no auto-post to LinkedIn

## Decision

1. **Four layers** (not one monolithic service):
   - **Triggers** — Task Scheduler, `npm run branding:tick`, UI buttons, optional queue drain on app open
   - **Job runner** — `editorial_jobs` table with lock, retry, `runAfter`
   - **Orchestrator** — `plan_horizon`, `ingest_sources`, `ingest_trends`, `draft_post` calling existing `brandCoach`, `contentPostWorkflow`, `applyCoachActions`
   - **Adapters** — `SourceFetcher` implementations (`rss`, `paste`, `url_readability`, optional `tavily_search`)

2. **Job queue over raw cron** as system of record; OS cron only invokes `branding:tick`.

3. **Static market calendar v1** (`web/data/market-calendars/*.json`); optional API sync later.

4. **Free-first sources:** RSS + readability + paste default; Tavily optional with monthly credit budget on `search_digest` / `trend_digest` only.

5. **Human-in-the-loop:** `draft_post` jobs set `review` unless `editorialAutopilotPolicy.autoMarkReady` is true.

6. **Reuse** existing coach actions and `contentPostWorkflow` — no parallel prompt stack.

## Consequences

- **Positive:** Same semantics local and cloud; catch-up on next tick; provenance on posts via `sourceItemIds`.
- **Negative:** More tables and Settings surface; Tavily/Firecrawl keys stay in env only.
- **Operational:** Run `npm run db:repair` after pull; schedule `branding:tick` 1–2×/day locally.

## Alternatives considered

- **Cron-only Next.js timers** — rejected; stops when dev server stops; no overlap protection.
- **Separate crawler microservice** — rejected; adapters behind `SourceFetcher` suffice.
- **Firecrawl v1** — deferred; paid at scale; Tavily covers discovery.
