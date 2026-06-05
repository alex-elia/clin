# ADR-0010: Unified contact analysis, staged capture pipeline, and contact playbook

## Status

Accepted

## Context

Clin runs **two parallel recommendation systems** for the same contacts:

1. **Cleaning** (`contact_analyze` in `llmAnalysis.ts`) — `outreach_fit`, `cleaning_plan` buckets, `action_queue` sync; stored on contact LLM JSON columns.
2. **Campaign members** (`campaign_icp_check` in `campaignIcpMatch.ts`) — `icp_match`, `icp_recommended_action`; stored on `outreach_campaign_members`.

After profile capture, **campaign post-capture workflow** runs ICP check only (`campaignPostCaptureWorkflow.ts`). **Contact analysis** may run separately via autopilot (`maybeAutopilotAnalyzeAfterProfileCapture`). The two paths use different vocabularies (`reach_out_dm` vs `keep_and_draft`, etc.) and different context: campaign ICP already merges profile + posts via `getLatestProfileContextForOutreach`, but `contact_analyze` sends scalar contact fields only.

**Posts** are captured manually (`pageType: posts`) and are not chained in enrich autopilot. **Company / job intel** is limited to headline and experience bullets on the profile; no company page or jobs capture exists.

Users need **one strategic/tactical advice model** (clean from network, nurture, comment, message, etc.) shared across **Cleaning** and **Campaigns**, with richer inputs (posts, company jobs, optional web intel) and analysis that runs **after** capture intel is stored—not during ingest.

Inbox thread analysis already uses a **strategic + tactical** two-layer prompt and motion-specific playbooks (`threadAnalysisPrompt.ts`, `salesCoachPlaybook.ts`). That pattern should extend to contact-level analysis.

## Decision

### 1. Staged capture-then-analyze pipeline

Split post-capture work into three phases:

| Phase | Responsibility | Rule |
|-------|----------------|------|
| **A — Capture** | Extension autopilot + manual capture; `ingestCapture` writes `capture_sessions` | **No LLM** at ingest. Raw JSON only. |
| **B — Context** | `buildContactContextBundle(contactId)` assembles prompt-ready blocks | All analyzers read through this module; no ad-hoc `capture_sessions` queries in feature code. |
| **C — Analysis** | `postCaptureAnalysis` orchestrator after chain completes | `contact_analyze` and `campaign_icp_check` run **in parallel** on the same bundle; draft generation stays **sequential** after ICP. |

**Trigger:** extension sends optional `captureChainStep` and `captureChainComplete` on ingest payloads. Analysis runs only when `captureChainComplete: true` (end of autopilot chain) or when chaining is disabled (single-step manual capture). Intermediate ingests return `{ analysisDeferred: true }`.

**Autopilot chain (opt-in settings):** profile → posts → company → company_jobs → optional web_page / Tavily. Each step is a separate paced ingest. Company intel is **consumed in Phase B/C**, not produced at ingest time.

### 2. ContactContextBundle (L1 read-model)

New module `web/src/lib/contactContextBundle.ts` exports:

- `profile_context` — from `getLatestProfileContextForOutreach` (profile About/bullets + posts text).
- `company_intel_context` — from `getLatestCompanyIntelForContact` (company page, jobs list, optional `web_page` excerpt).
- `context_completeness` — depth flags per source: `profile`, `posts`, `company`, `web` (`missing` | `thin` | `ok`).

All LLM features that judge a contact (`contact_analyze`, `campaign_icp_check`, `outreach_draft`, inbox coach) accept or internally build this bundle.

### 3. ContactPlaybook (L3 recommendation model)

New module `web/src/lib/contactPlaybook.ts` defines a **canonical** `ContactNextAction` enum:

`enrich_first` | `review_remove` | `engage_comment` | `nurture` | `message` | `hold` | `needs_review`

`ContactPlaybook` merges:

- **Base:** `contact_analyze` output (`cleaning_plan`, `outreach_fit`, `posts_signals`, strategic/tactical layers).
- **Overlay:** `campaign_icp_check` when the contact is a campaign member (`icp_match`, `recommended_action`).

Persist playbook on the contact LLM envelope (`contactSqlExtras`) in v1; no new table. **Cleaning board** and **campaign member cards** read `ContactPlaybook`; they do not duplicate bucket resolution logic.

Campaign member `icp_*` columns remain for filters and extension handoff; playbook is the **human-facing** unified advice. ICP columns are the **campaign-scoped** machine input for auto-draft rules.

### 4. Enriched contact_analyze prompt

Extend `contact_analyze` (ADR-0005 `completeChat`, feature tag unchanged):

- User payload includes full `ContactContextBundle` as labeled JSON sections.
- System prompt adds motion-specific playbook block (`salesCoachPlaybook.ts`) and **strategic then tactical** output shape (aligned with inbox thread analysis).
- Optional schema fields: `reasoning_steps[]`, `posts_signals`, `strategic_assessment`, `tactical_action`.
- Optional two-pass when company intel is long: `contact_intel_summarize` → `contact_analyze`.

### 5. New capture types and contact fields

Extend ingest schema (additive `schemaVersion` when needed):

| `pageType` | Stored facts |
|------------|--------------|
| `company` | About, industry, size band, website URL, HQ (from LinkedIn company page) |
| `company_jobs` | Visible job titles, locations, age labels |
| `web_page` | Careers or other URL fetched via readability adapter |

Add nullable `contacts.company_linkedin_url` (from Voyager during profile capture).

Reuse editorial `SourceFetcher` / Tavily adapter for optional `contact_intel` discovery with a **per-day credit budget** in Settings (separate from editorial policy).

### 6. Layer boundaries (dependency direction)

```
L4 UI (Cleaning, Campaigns) → L3 ContactPlaybook → L2 Analysis features → L1 ContactContextBundle → L0 capture_sessions
```

- Do **not** merge all features into one mega-prompt; keep separate `completeChat` feature tags.
- Do **not** add a generic agent/tool loop; orchestration stays explicit in `postCaptureAnalysis.ts`.
- External intel adapters write to L0; summaries are produced in L2 only.

## Alternatives considered

| Alternative | Why not |
|-------------|---------|
| Single LLM call producing both cleaning_plan and icp_match | Harder to refresh campaign ICP without re-running full contact analysis; couples owner-context and campaign-context prompts. |
| Run analysis on every ingest (including company) | Wastes LLM calls mid-chain; company intel not yet complete. |
| New `contact_playbooks` table | Extra migration and sync; contact LLM envelope sufficient for v1. |
| Paid enrichment APIs (Clearbit, etc.) | Conflicts with local-first posture; LinkedIn-visible + free web sources first. |

## Consequences

- **Positive:** One advice model for Cleaning and Campaigns; richer grounding (posts, jobs); clear layer seams for future features; inbox coach patterns reused at contact level.
- **Negative:** Longer autopilot chains (more LinkedIn surface and pace budget); extension and ingest contract changes; phased rollout required (see [SPEC-0005](../specifications/SPEC-0005-unified-contact-analysis.md)).
- **Operational:** Settings must expose toggles for posts/company chaining and Tavily intel budget; FinOps logs should include `context_completeness` in `completeChat` meta.
- **Supersedes nothing**; complements ADR-0002 (campaigns), ADR-0003 (derived readiness), ADR-0005 (LLM layer), ADR-0008 (SourceFetcher pattern for web intel).

## Related

- [SPEC-0005: Unified contact analysis](../specifications/SPEC-0005-unified-contact-analysis.md)
- [SPEC-0001](../specifications/SPEC-0001-clin-system-specification.md) (system overview, updated references)
- [DESIGN.md](../DESIGN.md) — company/jobs autopilot documented as higher-risk, opt-in LinkedIn surface
