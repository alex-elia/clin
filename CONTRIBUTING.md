# Contributing to Clin

Thank you for helping improve Clin. This document covers local setup, quality checks, and how we keep standards consistent in an open-source repo.

## Setup

```bash
git clone https://github.com/alex-elia/clin.git
cd clin
npm install          # root — installs Husky + Electron tooling
npm --prefix web ci  # Next.js app (required for dev and checks)
```

Node **22** (see `.nvmrc`). After `npm install` at the repo root, **Git hooks are installed automatically** via the `prepare` script.

## Quality checks (what runs where)

| Check | Pre-commit (local) | CI (GitHub Actions) | Manual |
|-------|-------------------|---------------------|--------|
| ESLint on staged `web/**/*.{ts,tsx}` | yes | full `web/` lint | `npm run lint --prefix web` |
| TypeScript (`tsc --noEmit`) | yes (whole `web/`) | yes | `npm run typecheck --prefix web` |
| `next build` | no (slow) | optional later | `npm run build --prefix web` |

**Pre-commit is a fast safety net; CI is the source of truth.** Hooks can be skipped (`git commit --no-verify`); PRs must pass CI before merge.

### Run all checks locally

```bash
npm run check
```

Equivalent to typecheck + lint on `web/`.

## Git hooks (shared with every contributor)

Hooks live in **`.husky/`** and are committed to the repository. Configuration:

- **`.husky/pre-commit`** — runs `lint-staged` then `web` typecheck
- **`lint-staged.config.mjs`** — ESLint with `--fix` on staged web TS/TSX files
- **Root `package.json`** — `"prepare": "husky"` installs hooks after `npm install`

This is the standard OSS pattern for JavaScript/TypeScript: **no separate install step** beyond `npm install` at the repo root.

### Skip hooks (emergency only)

```bash
git commit --no-verify -m "WIP: debugging"
```

Use sparingly. Fix lint/type errors before pushing if CI fails.

### Hooks not running?

1. Run `npm install` from the **repository root** (where `.git` lives).
2. Confirm `.husky/pre-commit` exists and is executable.
3. Re-run `npx husky` from the repo root if needed.

## Before you open a PR

1. Read [`docs/DESIGN.md`](./docs/DESIGN.md) and relevant [ADRs](./docs/adr/README.md) for architectural changes.
2. Run `npm run check` (or rely on pre-commit).
3. Keep PRs **focused** — one concern per PR when possible.
4. Extension / LinkedIn DOM fixes usually touch `extension/background.js`; describe how you tested on LinkedIn.
5. Do **not** commit `web/data/`, `.env.local`, or secrets.

## Project structure (where to change things)

| Area | Path |
|------|------|
| Dashboard & API | `web/src/` |
| Chrome extension | `extension/` |
| DB schema & migrations | `web/src/db/schema.ts`, `web/drizzle/` |
| Specs & ADRs | `docs/` |

## OSS quality best practices (how we manage quality)

1. **Automated CI on every PR** — [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs lint + typecheck so contributors and maintainers get the same bar without trusting local machines alone.

2. **Shared local hooks** — Husky + lint-staged in git so `npm install` aligns everyone’s pre-commit behavior. Documented here, not in a wiki-only doc.

3. **Fast feedback loop** — lint-staged only touches staged files; full `tsc` stays cheap enough to run each commit.

4. **Clear scripts** — `npm run typecheck`, `npm run lint`, `npm run check` at root delegate to `web/` so docs stay simple.

5. **Optional stricter gates later** — add PR-required CI checks in GitHub branch protection; optional `build` job in CI; extension smoke tests when the project grows.

6. **No secret enforcement in hooks** — pre-commit does not push or deploy; release workflows stay separate ([`release-desktop.yml`](./.github/workflows/release-desktop.yml)).

## Questions

Open a [GitHub issue](https://github.com/alex-elia/clin/issues/new) for bugs and ideas. For larger features, an issue discussion before a big PR helps align with maintainer direction.
