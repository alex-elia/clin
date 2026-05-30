# ADR-0006: Local dev singleton and runtime identity

## Status

Accepted

## Context

Clin is local-first: one SQLite file, one Next.js API, one Chrome extension base URL. In practice, developers hit:

- Orphaned `node` processes after closing Cursor terminals (port 3000 still bound).
- Next.js falling back to port 3001 while the extension still calls 3000.
- `better-sqlite3` built for a different Node ABI than the process running `next dev`.
- Two dev servers writing the same `clin.db` (SQLite single-writer assumptions).

These look like “DB mismatch” but are **runtime identity** failures: wrong process, wrong port, or wrong Node.

## Decision

1. **Single writer per database** — at most one Clin API process per `clin.db` in local dev.
2. **Fixed dev port** — `npm run dev` starts Next with `-p` from `CLIN_DEV_PORT` (default **3000**); refuse to start if the port is taken by Clin or another app.
3. **Dev lock file** — `web/data/.clin-dev.lock` records `{ pid, port, startedAt, node }`; removed on exit and by `npm run dev:stop`.
4. **Health as contract** — `GET /api/health` returns `service`, `db`, `dbPath`, `apiRevision`, `port`, `nodeVersion`. Extension and scripts verify this before capture.
5. **Native module preflight** — `predev` / `ensure-sqlite-native.mjs` rebuilds `better-sqlite3` when load fails for the current Node.
6. **Node pin** — `.nvmrc` at repo root and `web/` (Node 22 LTS line).

## Consequences

- **Positive:** Extension, dashboard, and scripts agree on which server and DB are live; fewer stale-port and split-brain issues.
- **Positive:** `npm run dev:stop` kills port listeners and clears the lock.
- **Negative:** Cannot run two Clin dev instances against the same DB without changing `CLIN_DEV_PORT` and `CLIN_DB_PATH` deliberately.
- **Operational:** Use one Node on PATH (or nvm use) before `npm install` / `npm rebuild better-sqlite3`.

## Alternatives considered

- **New DB per dev session** — rejected; forks user data.
- **Extension opens SQLite** — rejected (see ADR-0001).
- **Auto-kill port 3000 without health check** — rejected; could kill unrelated apps.
