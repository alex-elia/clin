# SPEC-0003: Post autopilot UX, gamification, tutorial

## Implemented (v1)

- **Autopilot panel** on post editor: sequential pipeline with animated progress, XP counter, level labels (Creator → Storyteller → Publisher).
- **Steps**: scan brief → voice → coach draft → apply → visual plan → visual gen (optional) → polish → done.
- **Tutorial layer**: floating `?` + first-visit “Take the tour”; highlights `[data-tour]` sections with backdrop.

## Planned — gamification (v2)

| Feature | Notes |
|--------|--------|
| Persisted XP | `user_context` or local profile; weekly streak for posts marked ready |
| Achievements | Badges: first autopilot, 5 ready posts, first extension publish |
| Step micro-rewards | Confetti particles on step complete (canvas/CSS only) |
| Leaderboard | Optional local-only “personal best” time-to-ready |

## Planned — animation (v2)

| Feature | Notes |
|--------|--------|
| Stage transitions | Framer Motion or CSS view transitions between steps |
| Live preview | Typewriter hook/body in sidebar while draft step runs |
| Sound | Optional subtle chime on complete (user setting, off by default) |

## Planned — tutorial (v2)

| Feature | Notes |
|--------|--------|
| Contextual tips | Per-field `?` linking to ADR/spec snippets |
| Extension tour | Mirror branding tab steps in `extension/popup.js` |
| Video embed | Optional 30s Loom in setup wizard |
| `helpKey` registry | Central `tutorialHelp.ts` for all Clin surfaces |

## API

Autopilot reuses existing routes: `/api/branding/coach`, `/api/branding/coach/apply`, `/api/branding/generate-image/prompt`, `/api/branding/generate-image`. No monolithic autopilot endpoint (keeps progress visible per step).
