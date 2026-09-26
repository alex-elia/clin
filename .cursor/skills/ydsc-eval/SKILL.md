---
name: ydsc-eval
description: Run and interpret the Yekdusecar agent eval harness (golden cases, pass/fail, Cursor SDK). Use when the user mentions harness, eval, smoke case, golden prompts, or checking that shared AGENTS.md rules still hold.
---

# YDSC eval harness

Canonical runner lives in `yekdusecar`. Do not invent a parallel eval script in a host repo.

## Run

From the yekdusecar root:

```bash
npm install
npm run eval
```

Requires `CURSOR_API_KEY` in the environment or `.env` (never commit `.env`).

## Cases

- Files: `harness/cases/*.json`
- v1 smoke case asks the agent to name related repos from `AGENTS.md` and forbids commit/push
- Exit non-zero if any case fails (missing expected substrings, or runner error)

## When adding a case

1. Add `harness/cases/<id>.json` with `id`, `prompt`, `expectAny` or `expectAll`.
2. Keep prompts read-only. Do not ask the eval agent to commit or edit product code.
3. Run `npm run eval` and confirm pass before treating the case as live.

## Interpreting results

- Pass: expected strings found in the agent result text.
- Fail: print the case id, missing strings, and a short excerpt. Do not "fix" a fail by weakening the case unless the user asks.
