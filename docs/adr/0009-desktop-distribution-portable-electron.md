# ADR-0009: Desktop distribution strategy — portable Electron and GitHub Releases

## Status

Accepted

## Context

Clin is now published as open source, but target users in early community rollout (including CJD individuals) are mostly non-technical. The current source-first flow (`git clone`, Node install, `npm run dev`) is too heavy for that audience.

Clin is also a two-part local-first system:

1. A local web app/API process (Next.js + SQLite) that owns persistence (ADR-0001).
2. A Chrome extension that sends capture and workflow requests to the local API over `127.0.0.1`.

This means "browser app like Google Meet" is not a direct match. Google Meet installs are thin clients to a remote backend, while Clin's backend runs on the user's machine. Any easy desktop packaging must still start and manage the local server process and keep runtime identity stable (ADR-0006).

## Alternatives considered

| Option | End-user ease | Maintainer effort | Local-first fit | Signing/store friction |
|---|---|---|---|---|
| Source + `npm run dev` | Low | Very low | Strong | None |
| Portable ZIP + embedded Node + launcher scripts | Medium | Low | Strong | Low |
| Portable Electron (`portable`/`zip`) | High | Medium | Strong | Medium (unsigned first-run warnings) |
| Electron installer targets (NSIS/DMG) | High | Medium-high | Strong | Higher trust expectations |
| Tauri shell | High | Higher | Strong | Similar long-term signing considerations |
| PWA only | Medium initially, brittle in practice | Low | Partial (server still needed) | Low |
| Cloud-hosted Clin + PWA | High | High (ops/auth/compliance) | Weak vs ADR-0001 default | Hosting and compliance overhead |

The portable Electron path is the best balance for community v1: easy for non-technical users, compatible with the current architecture, and feasible without blocking launch on app-store workflows.

## Decision

1. Use **portable Electron** as primary desktop packaging for non-developer users.
   - Windows target: `portable` (single `.exe`) and/or `zip`.
   - macOS target: `zip` containing `Clin.app` (no DMG requirement for v1).
2. Electron main process starts a packaged Next.js runtime and loads `http://127.0.0.1:3000`, preserving the local API contract used by the extension.
3. Keep database/user state outside install directories by setting or bootstrapping `CLIN_DB_PATH` to OS user app-data locations.
4. Ship the Chrome extension as a **versioned ZIP** on the same GitHub Release; users install via **Load unpacked** for v1.
5. Use **GitHub Releases** as the end-user distribution channel; the source repository remains the contributor channel.
6. Do not bundle Ollama or force AI setup in packaging. AI configuration remains user-managed in app settings.

## Consequences

- **Positive:** One-click launch UX for users while preserving local-first architecture.
- **Positive:** No requirement to maintain a full hosted SaaS path for v1.
- **Positive:** Compatible with current extension-to-localhost API integration.
- **Negative:** Unsigned binaries may trigger first-run warnings on Windows/macOS.
- **Negative:** Packaging requires Electron build wiring and native module rebuild handling.
- **Operational:** Keep extension and app release versions coordinated so support docs remain clear.

## Deferred follow-ups (not part of this ADR)

- Add Chrome Web Store unlisted distribution for easier extension install.
- Add optional localhost PWA install as a secondary UX path.
- Revisit Tauri only if artifact size/runtime overhead becomes a clear problem.
- Add signing/notarization when distribution scale warrants it.
