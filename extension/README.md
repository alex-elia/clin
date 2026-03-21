# Clin Chrome extension (MV3)

Manual capture only: reads **visible** fields on the active LinkedIn tab when you click **Capture this page**, then `POST`s JSON to your local Clin app.

## Load unpacked

1. Run the web app: `cd web && npm run dev` (default `http://127.0.0.1:3000`).
2. Chrome → **Extensions** → enable **Developer mode** → **Load unpacked** → select this `extension/` folder.
3. Open a LinkedIn profile in a tab, click the Clin icon → **Capture this page**.

## Settings

- **Clin API base** — defaults to `http://127.0.0.1:3000`. Save after editing.

## Pacing

Before each capture, the background script calls `GET /api/settings` and enforces the same **rolling hourly cap** and **minimum seconds between captures** as the server (with a local pre-check so you see a fast error if you are going too fast).

Tune limits under **Pacing** in the Clin dashboard (`/settings`).

## Ready outreach in the popup

When you **approve** drafts in the dashboard (`/decisions` → Ready), the extension
popup loads **`GET /api/outreach/ready`** automatically (and on **Refresh ready
list**). For each item you can **Copy draft**, **Open profile** (new tab), and
**Mark sent (manual)** after you paste/send on LinkedIn yourself.

Clin still does not send messages for you.

## Out of scope (by design)

- No auto-scroll, scheduled capture, or scripted clicks / typing on LinkedIn.
- Pacing is for **low-risk human habits**, not “stealth” or evasion.

If LinkedIn changes the DOM, extraction may return partial fields; check **Captures** in the dashboard and adjust selectors in `background.js` as needed.
