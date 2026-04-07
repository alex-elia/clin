# ADR-0003: Derived profile readiness (no column on campaign members)

## Status

Accepted

## Context

Users need to **filter** campaign members by whether a **full LinkedIn profile** was captured before generating drafts, and to drive a **capture queue** (“who to open next”). Storing a manually updated `profile_status` on each member would drift from reality and require extra writes on every ingest.

## Decision

1. **Readiness** is **computed** from data already stored:
   - Latest **`capture_sessions`** row per contact with **`page_type = 'profile'`** and its **`extracted_json`**.
   - Rules distinguish **missing** (no such capture), **thin** (minimal or sparse JSON), and **detailed** (About length and/or experience/education bullets).
2. If a profile-type capture row exists but JSON is empty or unparsable for those rules, treat depth as at least **thin** (the page was captured; DOM may have been thin or selectors failed).
3. **Batch draft generation** defaults to **detailed** profiles only; an explicit **allow weak profile** flag includes others.
4. **campaign-context** API enriches the extension with **queue counts** and a suggested **next profile URL** from the same rules.

## Consequences

- **Positive:** No migration churn on member rows; ingest stays the single writer for capture truth; filters stay consistent with `capture_sessions`.
- **Negative:** List views run extra queries / joins (mitigated by batching latest captures per contact id); changing rules retroactively reclassifies members (usually desirable).
