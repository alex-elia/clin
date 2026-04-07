# ADR-0002: Outreach campaigns, capture target, and local LLM drafts

## Status

Accepted

## Context

Users need to run **batch-style outreach prep**: shared pitch context, per-contact drafts, and a path from **dashboard** to **extension** without Clin sending LinkedIn messages. Earlier designs used queue rows with draft fields only; multi-campaign context and “fill this list from LinkedIn” workflows required a clearer model.

## Decision

1. Introduce **`outreach_campaigns`** (name, `context_text`, optional writer instructions and system prompt override) and **`outreach_campaign_members`** (link to `contacts`, `draft_outreach`, `status`: draft → ready → sent | skipped).
2. Store **`extension.capture_target_campaign_id`** in **`app_settings`**: the extension polls **`GET /api/extension/campaign-context`** and attaches **`outreachCampaignId`** to ingests so new captures **add members** to that campaign when appropriate.
3. Store **`extension.active_outreach_campaign_id`** for the extension **Outreach** tab / ready-queue UX tied to a single active campaign.
4. Generate drafts with **local Ollama** from server-side code; prompts include campaign text + contact fields + **latest profile capture JSON** (About, experience/education bullets). **No** LinkedIn DM history in scope.

## Consequences

- **Positive:** Clear separation between “campaign list + drafts” and legacy **Decisions** / `action_queue` outreach fields; capture target automates list growth from LinkedIn.
- **Negative:** Two concepts in the product (**campaign members** vs **queue outreach**); documentation and UI must clarify which path is primary for new work (campaigns).
- **Operational:** Ollama must be running for LLM features; failures are surfaced in the UI.
