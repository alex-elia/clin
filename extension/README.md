# Clin Chrome extension (MV3)

Companion to the local Clin web app: capture visible LinkedIn data, manage campaign context, and run **optional paced automation** (list sprint, hygiene, outreach) when enabled in Clin **Settings**.

## Load unpacked

1. Run the web app from the repo root: `npm install && npm run dev` (default API `http://127.0.0.1:3000`).
2. Chrome → **Extensions** → enable **Developer mode** → **Load unpacked** → select this `extension/` folder.
3. Open LinkedIn, open the Clin popup, and connect to your local API.

## Settings

- **Clin API base** — defaults to `http://127.0.0.1:3000`. Save after editing.

## Capture

Click **Capture this page** on a profile (or use **list sprint** when allowed in Settings) to send visible fields to `POST /api/ingest/capture` or the connections ingest endpoint.

## Pacing

The background script calls `GET /api/settings` and applies the same **rolling hourly cap** and **minimum seconds between captures** as the server. Tune limits in the dashboard under **Settings → Pacing**.

## Outreach handoff

Approve drafts in the dashboard (**Decisions** / campaigns → Ready). The popup loads ready items via `/api/outreach/ready` and campaign APIs. You can **copy drafts**, **open profiles**, **mark sent**, or start a **paced outreach run** when configured.

## Optional automation (Settings)

| Feature | Summary |
|---------|---------|
| **List sprint** | Scroll/load a connections list and import visible rows (keep the popup open). |
| **Hygiene runner** | Open profiles from your local queue on a timer, with a daily cap. |
| **Outreach run** | Paced campaign outreach steps with confirm/skip. |

Enable each feature in Clin → **Settings**. Start with default caps; increase only if you accept platform and account risk.

## Platform use

Clin is a user-operated tool. You are responsible for complying with LinkedIn (and any other site’s) terms. See the [root README](../README.md#responsible-use-and-third-party-platforms).

If LinkedIn changes the DOM, extraction may return partial fields — check **Captures** in the dashboard and update selectors in `background.js` as needed.
