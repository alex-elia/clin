# Clin Chrome extension (MV3)

Manual capture only: reads **visible** fields on the active LinkedIn tab when you click **Capture this page**, then `POST`s JSON to your local Clin app.

## Load unpacked

1. Run the web app: `cd web && npm run dev` (default `http://127.0.0.1:3000`).
2. Chrome → **Extensions** → enable **Developer mode** → **Load unpacked** → select this `extension/` folder.
3. Open a LinkedIn profile in a tab, click the Clin icon → **Capture this page**.

## Settings

- **Clin API base** — defaults to `http://127.0.0.1:3000`. Save after editing.

## Out of scope (by design)

- No auto-scroll, scheduled capture, or scripted clicks on LinkedIn.
- No randomized delays or other “anti-detection” behavior — that would still be risky and is not part of Clin.

If LinkedIn changes the DOM, extraction may return partial fields; check **Captures** in the dashboard and adjust selectors in `background.js` as needed.
