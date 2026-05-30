# Architecture Decision Records (Clin)

ADRs document **significant, stable** choices for Clin. They complement [DESIGN.md](../DESIGN.md) (vision and boundaries) and [SPEC-0001](../specifications/SPEC-0001-clin-system-specification.md) (as-built behavior).

## Index

| ADR | Title |
|-----|--------|
| [0001](./0001-local-first-extension-ingest.md) | Local-first persistence; extension → HTTP → server → SQLite |
| [0002](./0002-outreach-campaigns.md) | Named outreach campaigns, capture target, Ollama drafts |
| [0003](./0003-profile-readiness-derived.md) | Derived profile readiness from captures (not a stored member field) |
| [0004](./0004-linkedin-url-canonicalization.md) | Canonical profile URLs and Unicode normalization |
| [0005](./0005-unified-llm-inference-layer.md) | Unified `completeChat` LLM layer; Ollama first, cloud-ready |
| [0006](./0006-local-dev-singleton.md) | Local dev singleton: fixed port, lock file, health contract |
| [0007](./0007-content-calendar-brand-coach.md) | Content calendar, Brand Coach, extension publish handoff |

## Conventions

- **Filename:** `NNNN-short-kebab-title.md` (four-digit number, leading zeros).
- **Sections:** Status, Context, Decision, Consequences (optional: Alternatives considered).
- **Status:** Proposed | Accepted | Superseded by ADR-XXXX (with link).

When an ADR is superseded, add a line at the top of the old file pointing to the replacement.
