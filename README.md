# Clin

**Local-first LinkedIn assistant** — open source software you run on your own machine to capture your network, clean you contacts base, prepare outreach drafts, and run **optional, paced automation** when you choose.

Clin is a **community-owned tool**: inspect the code, fork it, and adapt it. Data stays on your disk by default. You control which features are on and how fast they run.

## What you can do

| Area | Capabilities |
|------|----------------|
| **Capture** | Save visible profile and list data from LinkedIn into a local SQLite database (manual capture, connections list sprint, hygiene batches). |
| **Understand** | Score contacts, review queues, analytics, and an auditable capture log. |
| **Prepare** | Outreach campaigns, Ollama-powered drafts (local LLM), decisions workflow, inbox snapshots. |
| **Automate (optional)** | Extension runners for list import, hygiene visits, and paced outreach — enabled in **Settings**, with shared caps between server and extension. |
| **Own your data** | Backup, export, import, and configurable DB path under **Settings → Data**. |

Typical flow: **capture → review → draft → approve → hand off to the extension** (copy, open profile, or paced runner — your choice).

## Quick start

**Prerequisites:** [Node.js](https://nodejs.org/) 20+, npm, Google Chrome.

From the repository root:

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). On first API use, SQLite is created at `web/data/clin.db` (migrations from `web/drizzle/`).

### Chrome extension

1. Keep the web app running (`npm run dev`).
2. Chrome → **Extensions** → **Developer mode** → **Load unpacked** → select the [`extension/`](./extension/) folder.
3. Set **Clin API base** to `http://127.0.0.1:3000` if needed.
4. Open LinkedIn, use the Clin popup (capture, campaigns, optional runners).

Details: [`extension/README.md`](./extension/README.md).

### Optional: local LLM (Ollama)

Install [Ollama](https://ollama.com/), pull a model (e.g. `qwen2.5:8b`), and point Clin at `http://127.0.0.1:11434` in dashboard settings. Draft generation runs **only** against your machine.

### Useful commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dashboard + API |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run db:repair` | Repair / migrate local SQLite |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:generate` | New migration from `web/src/db/schema.ts` |

Equivalent from `web/`: `cd web && npm install && npm run dev`.

## Repository layout

| Path | Description |
|------|-------------|
| [`web/`](./web/) | Next.js app — dashboard, REST API, SQLite (Drizzle) |
| [`extension/`](./extension/) | Chrome MV3 — capture, campaigns, optional automation runners |
| [`docs/`](./docs/) | [DESIGN](./docs/DESIGN.md), [SPEC-0001](./docs/specifications/SPEC-0001-clin-system-specification.md), [ADRs](./docs/adr/README.md) |

## How Clin is built

- **Local-first:** extension talks to `127.0.0.1`; the server owns the database (the extension never opens `clin.db` directly).
- **You set the pace:** rolling hourly capture limits, minimum gaps between actions, daily hygiene caps — tunable under **Settings** and mirrored in the extension.
- **Conservative defaults:** automation features are opt-in; start slow and raise limits only when you understand the tradeoffs.
- **Transparent:** captures and snapshots are logged so you can see what was read and when.

Architecture and product boundaries: [`docs/DESIGN.md`](./docs/DESIGN.md). Current behavior: [`docs/specifications/SPEC-0001-clin-system-specification.md`](./docs/specifications/SPEC-0001-clin-system-specification.md).

## API (local)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Liveness + `db` flag |
| `POST` | `/api/ingest/capture` | Profile / page ingest |
| `POST` | `/api/ingest/connections-page` | List batch ingest |
| `GET` | `/api/contacts` | List / search |
| `PATCH` | `/api/contacts/[id]` | Update fields → rescore |
| `GET` | `/api/queue?shuffle=1` | Review queue |
| `PATCH` | `/api/queue/[id]` | Queue decisions |
| `GET` | `/api/captures` | Capture log |
| `GET` | `/api/outreach/ready` | Approved drafts for extension / UI |
| `GET` / `PATCH` | `/api/settings` | Pacing and app settings |
| `GET` / `PATCH` | `/api/automation/settings` | Hygiene / automation toggles |
| `POST` | `/api/scores/recompute` | Recompute all scores |

Extension-specific routes live under `/api/extension/*` (campaign context, outreach queue, brand assets). See SPEC-0001 for the full catalog.

## Responsible use and third-party platforms

Clin is **software for end users**. We provide source code and local tooling; **we do not** provide legal advice, and **we do not** help anyone bypass or ignore agreements they have with third-party platforms (including LinkedIn’s Terms of Service, Professional Community Policies, or similar rules elsewhere).

- **Your responsibility:** How you use Clin on LinkedIn (or any site) is your choice and your risk. Account restrictions or enforcement by a platform apply to **you**, not to the Clin maintainers.
- **No affiliation:** Clin is not affiliated with, endorsed by, or sponsored by LinkedIn.
- **No warranty on permitted use:** Using automation or bulk capture may be restricted or prohibited by a platform. Clin includes pacing to encourage careful use; pacing does **not** mean a platform approves your activity.
- **Privacy:** Do not commit `web/data/` (database, backups, exports) to git. Treat exports as sensitive personal data.

If you contribute or fork this project, keep disclaimers visible and avoid positioning the tool as a way to evade platform rules.

## Contributing

Issues and pull requests are welcome on GitHub. Read [`docs/DESIGN.md`](./docs/DESIGN.md) and [`docs/adr/README.md`](./docs/adr/README.md) before larger changes. For DOM breakage after a LinkedIn UI update, fixes usually land in `extension/background.js`.

## License

MIT — see [LICENSE](./LICENSE) when present in the repository.
