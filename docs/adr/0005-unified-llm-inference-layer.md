# ADR-0005: Unified LLM inference layer (Ollama first, cloud-ready)

## Status

Accepted — phase 2 (`openai_compatible` / OVH) implemented in Clin web (2026-05-29).

## Context

Clin uses a local LLM for several server-side features:

- Outreach campaign draft generation (`callOllamaJson` in `llmAnalysis.ts`)
- Copy assistant on form fields (`callOllamaText`)
- Contact analysis and user goals/positioning (`userProfileLlm`, `runContactLlmAnalysis`)

Today all of these call **Ollama’s native HTTP API** directly:

- Settings: `ollama.base_url` and `ollama.model` in `app_settings` ([`ollamaSettings.ts`](../../web/src/lib/ollamaSettings.ts))
- Transport: `POST {baseUrl}/api/chat` with Ollama-specific request/response shapes

We want to **switch or add cloud inference** later (e.g. OVH Cloud AI or any **OpenAI-compatible** endpoint) without rewriting every feature. Ollama and cloud providers differ in URL path, auth, and response JSON, so a single hard-coded client does not scale.

Product constraints remain:

- **Default:** local-first (Ollama on the user’s machine).
- **Optional later:** cloud provider with API key; user must understand data leaves localhost.
- No change to extension ↔ server ingest architecture (ADR-0001).

## Decision

Introduce a **unified LLM inference layer** in `web/src/lib/llm/` that all features use for chat completions. **Phase 1** implements only the **Ollama** provider by moving existing logic behind the new interface. **Phase 2** (later) adds an `openai_compatible` provider without changing call sites.

### 1. Configuration model

Replace ad hoc `getOllamaSettings()` usage at feature boundaries with **`getLlmConfig()`** (name may vary), backed by `app_settings` and env fallbacks:

| Key (proposed) | Purpose | Phase 1 default |
|----------------|---------|-----------------|
| `llm.provider` | `ollama` \| `openai_compatible` | `ollama` |
| `llm.base_url` | API root | migrate from `ollama.base_url` or same value |
| `llm.model` | Model id / tag | migrate from `ollama.model` |
| `llm.api_key` | Bearer token for cloud | empty (unused in phase 1) |

**Migration:** On read, if `llm.*` keys are missing, fall back to existing `ollama.base_url` / `ollama.model` so current installs keep working. New writes use `llm.*` keys. Deprecate Ollama-specific keys in UI copy only after migration is stable.

**Secrets:** Prefer `LLM_API_KEY` (or `OPENAI_API_KEY`) in `.env` for cloud; optional DB override only if needed later. Document in `.env.example` when phase 2 ships.

### 2. Public API (feature-facing)

Single entry point for chat completions:

```ts
type LlmProvider = "ollama" | "openai_compatible";

type LlmConfig = {
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
};

type CompleteChatParams = {
  config: LlmConfig;
  system: string;
  user: string;
  jsonMode?: boolean;      // outreach drafts, structured outputs
  temperature?: number;
  timeoutMs?: number;
};

// Returns assistant message text (plain string).
async function completeChat(params: CompleteChatParams): Promise<string>;
```

**Rules:**

- Features build **prompts only**; they do not call `fetch` or know the provider.
- `completeChat` selects an adapter by `config.provider`.
- Errors are normalized to a short message; provider name may be included for UI.

### 3. Provider adapters (internal)

| Provider | Phase | Endpoint (typical) | Notes |
|----------|-------|-------------------|--------|
| `ollama` | **1 — implement now** | `POST {baseUrl}/api/chat` | Current `callOllamaJson` / `callOllamaText` logic moves here; `jsonMode` → `format: "json"` |
| `openai_compatible` | **2 — stub or throw** | `POST {baseUrl}/v1/chat/completions` | OVH and similar; Bearer auth; map `choices[0].message.content` |

Phase 1 may implement `openai_compatible` as **`throw new Error("Not configured yet")`** or leave unregistered until phase 2, but **`LlmProvider` and `CompleteChatParams` must exist** so call sites do not reference Ollama types.

Suggested file layout:

```
web/src/lib/llm/
  config.ts           # getLlmConfig, updateLlmConfig, env + app_settings
  completeChat.ts     # router → adapter
  adapters/
    ollama.ts         # phase 1
    openaiCompatible.ts  # phase 2 (stub in phase 1)
  errors.ts           # shared HTTP / empty-response handling
```

### 4. Refactor map (phase 1)

| Current | After phase 1 |
|---------|----------------|
| `callOllamaJson` | `completeChat({ jsonMode: true, ... })` |
| `callOllamaText` | `completeChat({ jsonMode: false, ... })` |
| `getOllamaSettings()` at feature sites | `getLlmConfig()` |
| `listOllamaModels(baseUrl)` | Keep for Ollama provider only in Settings UI (or `listModels(config)` on adapter) |

**Call sites to migrate:**

- `web/src/lib/llmAnalysis.ts` — contact analysis
- `web/src/lib/outreachCampaignDraft.ts` — campaign drafts
- `web/src/lib/copyAssistant.ts` — copy assistant (server)
- `web/src/lib/userProfileLlm.ts` — goals / positioning

`ollamaSettings.ts` may remain as a thin re-export or be merged into `llm/config.ts` for one release to avoid breaking imports.

### 5. Settings UI (phase 1)

- Rename section to **“LLM”** or **“Inference (LLM)”**; default provider **Ollama (local)**.
- Fields: base URL, model (same as today). Provider dropdown visible but only **Ollama** enabled until phase 2.
- Help text: cloud providers will be added later; local Ollama keeps data on your machine.

### 6. Phase 2 (out of scope for phase 1 implementation)

- Implement `openai_compatible` adapter (OVH Cloud AI, etc.).
- Settings: API key field, provider = OpenAI-compatible, warning when not `ollama`.
- Optional: `response_format` / JSON mode parity for draft generation.
- Update README and RESPONSIBLE_USE: cloud inference sends prompts off-device.

## Alternatives considered

| Alternative | Why not (for now) |
|-------------|-------------------|
| Keep direct Ollama calls; add cloud as second code path in each feature | Duplication and inconsistent error handling |
| Standardize only on OpenAI-compatible API (vLLM, Ollama OpenAI shim) | Extra ops burden for local users; Ollama native API already works |
| LangChain / heavy SDK | Too much dependency for a small local app |
| Single env-only config (no SQLite) | Clin already stores Ollama URL/model in Settings; keep parity |

## Consequences

### Positive

- One place to add OVH / OpenAI-compatible support later.
- Features stay provider-agnostic; tests can mock `completeChat`.
- Clear extension point for timeouts, logging, and future streaming (if ever needed).

### Negative

- Phase 1 is a **refactor** with little user-visible benefit until phase 2.
- Two setting key families during migration (`ollama.*` vs `llm.*`) unless we migrate eagerly.
- `listOllamaModels` remains Ollama-specific until a generic model-list strategy exists for cloud.

### Operational

- Phase 1: no change to deployment (still local Ollama).
- Phase 2: operators must manage API keys and accept outbound HTTPS from the Next.js server.

## Implementation checklist (phase 1)

- [ ] Add `web/src/lib/llm/` module per layout above
- [ ] Implement `getLlmConfig()` with fallback from `ollama.*` keys
- [ ] Move Ollama HTTP logic into `adapters/ollama.ts`
- [ ] Replace `callOllamaJson` / `callOllamaText` usages with `completeChat`
- [ ] Update Settings page labels (LLM / Ollama default)
- [ ] Add note in SPEC-0001 § LLM / settings when behavior is migrated
- [ ] Do **not** expose `openai_compatible` in UI until adapter is implemented (phase 2)

## References

- Current transport: [`web/src/lib/llmAnalysis.ts`](../../web/src/lib/llmAnalysis.ts) (`callOllamaJson`, `callOllamaText`)
- Settings: [`web/src/lib/ollamaSettings.ts`](../../web/src/lib/ollamaSettings.ts)
- Related: [ADR-0002](./0002-outreach-campaigns.md) (Ollama for drafts)
