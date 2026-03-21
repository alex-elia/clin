# Clin

Local-first **LinkedIn network intelligence**: turn your connections into an actionable graph (capture, scoring, review queue, optional AI) — **without** automating clicks or messages on LinkedIn.

## Repository layout

| Path | Description |
|------|-------------|
| [`docs/`](./docs/) | Product and technical design ([DESIGN.md](./docs/DESIGN.md)) |
| [`web/`](./web/) | Next.js dashboard and API routes |

A Chrome MV3 extension will live under `extension/` when added; it posts captures to the local API only.

## Quick start (web app)

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Extension integration expects the app reachable at a fixed port (see `docs/DESIGN.md`).

**Health check (for the future extension):** `GET /api/health`

## Principles

- Capture only after **your** explicit action on a page you opened.
- Server owns persistence; the extension never touches the database file.
- Randomness and automation **inside Clin** only — not “humanization” bots on LinkedIn.

Details: [`docs/DESIGN.md`](./docs/DESIGN.md).
