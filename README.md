# Clin

Local-first **LinkedIn network intelligence**: capture, score, and review your graph from your machine — **without** automating clicks or messages on LinkedIn.

## Repository layout

| Path | Description |
|------|-------------|
| [`docs/`](./docs/) | Product and technical design ([DESIGN.md](./docs/DESIGN.md)) |
| [`web/`](./web/) | Next.js dashboard, SQLite (Drizzle), REST API |
| [`extension/`](./extension/) | Chrome MV3 — manual “Capture this page” → `POST /api/ingest/capture` |

## Quick start — web app

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). SQLite is created automatically at `web/data/clin.db` on first API use (migrations run from `web/drizzle/`).

### Useful scripts (`web/`)

- `npm run db:generate` — new migration from `src/db/schema.ts`
- `npm run db:push` — push schema (alternative to migrate)
- `npm run db:studio` — Drizzle Studio

## Chrome extension

See [`extension/README.md`](./extension/README.md). Load **unpacked** from `extension/` while `npm run dev` is running (default API `http://127.0.0.1:3000`).

## API (local)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Liveness + `db` flag |
| `POST` | `/api/ingest/capture` | Extension / manual ingest |
| `GET` | `/api/contacts` | List / search |
| `PATCH` | `/api/contacts/[id]` | Update fields → rescore |
| `GET` | `/api/queue?shuffle=1` | Review queue (optional **local** shuffle) |
| `PATCH` | `/api/queue/[id]` | `reviewed` / `deferred` / `dismissed` |
| `GET` | `/api/captures` | Capture log |
| `POST` | `/api/scores/recompute` | Recompute all scores |

## Principles (non-negotiable)

- Capture only after **your** explicit action on a page you opened.
- Server owns persistence; the extension never opens the DB file.
- **Local randomness only** (e.g. shuffled review order in the app). Clin does **not** implement randomized delays, stealth clicks, or other “anti-detection” automation on LinkedIn — that remains unsafe and out of scope.

Full detail: [`docs/DESIGN.md`](./docs/DESIGN.md).
