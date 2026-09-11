## Early beta — feedback welcome

Desktop installers and the extension zip are **new and lightly tested**. If you try this release, please [open an issue](https://github.com/alex-elia/clin/issues/new) with your OS, what you downloaded, and what went wrong (or what worked).

## Install (about 5 minutes)

1. **Desktop app** — download the asset for your OS below and run Clin (macOS: unzip, then right-click → **Open** the first time if Gatekeeper blocks the unsigned app).
2. **Chrome extension** — download `clin-capture-*.zip`, unzip, Chrome → Extensions → Developer mode → **Load unpacked** → select the extracted folder.
3. **First launch** — Clin opens at http://127.0.0.1:3000. Set an AI API key or Ollama in Settings if you want AI drafts.
4. **LinkedIn** — open LinkedIn, use the Clin extension to capture; report bugs via GitHub Issues.

### Assets

| Platform | File |
|----------|------|
| Windows | `Clin-*-windows-portable.exe` (or zip) |
| macOS (Apple Silicon) | `Clin-*-arm64-mac.zip` |
| Extension | `clin-capture-*.zip` |

**Requirements:** Google Chrome; optional LLM (OpenAI, Mistral, Ollama, etc.) for drafts.

## Changes

### Cleaning & exec queues

- **Cleaning board** accept flows: removal → disconnect exec queue; engage → AI comment + engage exec queue.
- Dashboard **Exec queues** panel: edit comments, regenerate, skip; syncs with extension **Cleaning** todo lists.
- Extension **engage** and **removal** runners with pace caps (Settings).

### Campaigns

- ICP can recommend **Engage via comment** (`engage_comment`) in addition to draft / skip / remove.
- **Orchestrate campaign** auto-queues engage or drafts based on ICP.
- **Queue engage** per member; **DM draft and Ready for extension** work in parallel with engage.
- Member filter **Engage queued**; status badges for engage pending + ready for extension.

### Capture & analysis

- **LinkedIn activity scoring** (ADR-0012): deterministic tiers (`active`, `occasional`, `lurker`, `dormant`, `unknown`) from posts capture; persisted on contacts, blended into Cleaning sort, campaign ICP/engage guards, UI badges.
- **Post origin** on activity capture: original vs reshare vs news share (better comment hooks).
- **Post recency**: prompts and engage skip posts older than 1 year.
- **Automated capture pipeline**: step-based, alarm-driven; more resilient when switching tabs or using the computer.

### Docs

- [SPEC-0006](https://github.com/alex-elia/clin/blob/main/docs/specifications/SPEC-0006-cleaning-exec-campaign-engage.md) — cleaning exec + campaign engage (release reference).
- Updated [SPEC-0001](https://github.com/alex-elia/clin/blob/main/docs/specifications/SPEC-0001-clin-system-specification.md) and [ADR-0011](https://github.com/alex-elia/clin/blob/main/docs/adr/0011-campaign-engage-shared-exec-queue.md).

**Extension version:** 0.2.59+ recommended (port 3100 default, outreach DM fixes, network hygiene pipeline on `/cleaning`).
