# ADR-0001: Local-first persistence — extension ingests via HTTP to server-owned SQLite

## Status

Accepted

## Context

Clin must store LinkedIn-derived data **on the user’s machine**, keep an **auditable** history of what was captured, and avoid splitting business rules between a browser extension and a database client. Alternatives included: extension writing SQLite directly (or via native messaging), or a cloud sync service as the primary store.

## Decision

1. The **Next.js app** owns the **only** write path to the database (Drizzle + better-sqlite3 on SQLite).
2. The **Chrome extension** sends **JSON over HTTP** to `127.0.0.1` (or configured base URL): `POST /api/ingest/capture`, `POST /api/ingest/connections-page`, etc.
3. The server **validates** payloads (Zod), **canonicalizes** LinkedIn URLs, **dedupes** contacts, writes **`capture_sessions`** and **`contact_snapshots`**, and applies **pacing** (429 + settings mirrored in the extension).
4. If the API is unavailable, the extension may **buffer** in `chrome.storage.local` (bounded) and retry — still no direct DB access.

## Consequences

- **Positive:** Single source of truth for schema, scoring, and compliance with pacing; easier testing of ingest on the server.
- **Negative:** Extension and server must stay in sync on **schemaVersion** and field shapes; user must run the web app for capture to persist.
- **Operational:** Binding to localhost and optional auth reduces accidental exposure.
