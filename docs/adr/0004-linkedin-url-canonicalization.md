# ADR-0004: LinkedIn profile URL canonicalization and Unicode normalization

## Status

Accepted

## Context

The same LinkedIn profile can appear with **percent-encoded** paths, **www** vs bare host, or **Unicode normalization** differences in the slug (e.g. `é` vs decomposed sequences). Without a single canonical form, **duplicate `contacts`** rows can appear; campaign members then point at a row **without** the latest `capture_sessions`, showing false **missing** profile readiness.

## Decision

1. Implement **`canonicalizeLinkedInUrl`** in server code (`web/src/lib/url.ts`): normalize host, path, decode profile slug segments, and apply **Unicode NFC** to `/in/{slug}` (and Sales Navigator lead mapping where supported).
2. Use this canonical URL as **`linkedin_url_canonical`** for **deduplication** and lookups on ingest.
3. The extension sends **`sourceUrl`** from the browser; the server always derives the canonical form — the extension does not need to replicate NFC logic.

## Consequences

- **Positive:** Fewer duplicate contacts; readiness and captures align with the member’s `contact_id`.
- **Negative:** Existing databases may already contain legacy duplicates; one-off cleanup or merge may still be needed; new ingests follow the stricter rule going forward.
