<!-- BEGIN:ydsc-agent-rules -->
# Yekdusecar (YDSC) agent rules

Shared workflow for Elia coding agents (local and cloud). Canonical source: `yekdusecar`. Change the marked block there, then run `npm run sync`. Do not edit this block by hand in a host repo.

## Session start

- Run `git status` before changing files.
- Do not assume prior work is committed or should be discarded.

## Git

- Never commit, push, amend, or skip hooks unless the user explicitly asks.
- When the user asks to commit, use conventional prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- Default product branch is `develop` when that repo uses it. Do not force-push `main` or `master`.

## Documentation

- Do not create new `.md` files unless the user asks.
- Exception: ADRs or SPECs only when the user requests them.
- Prefer a short chat answer over a new guide.

## Copy and UI

- No em dashes or en dashes in user-facing copy, UI strings, or commit messages. Use commas, periods, colons, parentheses, or a hyphen for compounds.
- After UI, layout, routing, or client-state changes, verify the flow in the browser. A single screenshot is not enough.

## Related repos

| Repo | Role |
|------|------|
| `yekdusecar` | YDSC: shared AGENTS.md, skills, agent eval harness |
| `nemrut` | Product app (Next.js, Supabase, Agent Studio) |
| `kale-infra` | Cluster, staging, production Kubernetes |
| `elia-studio` | Elia Studio site |
| `elia-site-tools` | Shared guest-agent packages for Elia sites |
| `matia-seo` | SEO packages and cockpit |
| `konaki-analipsi` | Konaki site |
| `onira` | Onira site |
| `atlas-efectis` | Atlas Efectis host |
| `kizil-rag` | Retrieval service |
| `clin` | Clin |

Product work belongs in the app repo. Cluster work belongs in `kale-infra`. Shared agent rules, skills, and harness belong in `yekdusecar`.
<!-- END:ydsc-agent-rules -->
