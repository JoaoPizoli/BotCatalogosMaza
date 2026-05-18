# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build   # Compile TypeScript → dist/ (tsc)
npm run dev     # node --watch on dist/app.js — restarts when dist/ changes, so run `tsc --watch` alongside it for true source reload
npm start       # Run compiled dist/app.js
```

`npm run dev` loads `.env` via `node --env-file`; `npm start` does not (set env vars externally or use `dev`).

No automated test suite — testing is done manually via Telegram.

Start the PostgreSQL dependency with `docker compose up -d` before running locally.

## Architecture

BotMaza is a Telegram bot for **sales representatives** built with TypeScript + grammy. It uses the **OpenAI Agents SDK** to dispatch user messages to one of four specialized AI agents. Agents use tools to query a product catalog, calculate quotes, and serve files from OneDrive.

### Request flow

1. User sends a message → `src/services/telegram.ts` handles all grammy events
2. Rate limit check (20 msg/min) + session timeout (10 min inactivity) enforced in `sessionManager.ts`
3. Guardrail check (`src/agents/guardrails.ts`) for prompt injection before any agent call
4. Message is routed to the selected agent (chosen via `/menu` inline buttons)
5. Agent runs tools, builds a response, and the bot sends it back; files (PDFs, catalogs, videos) are sent as Telegram attachments

### Agents (`src/agents/`)

| File | Role |
|---|---|
| `agenteOrcamentos.ts` | Quote generation (most complex — ~350 lines of system prompt) |
| `agenteCatalogo.ts` | Retrieves product catalogs from OneDrive |
| `agenteEmbalagem.ts` | Packaging specifications |
| `agenteVideos.ts` | Training and product videos |
| `guardrails.ts` | Validates input before agent execution |

Agent tools live in `src/agents/tools/`: `orcamentoTools.ts` (quote math, PDF generation, product search) and `oneDriveTools.ts` (OneDrive file traversal and download).

### Quote flow (`agenteOrcamentos`)

1. Extract product/quantity/discount/state (UF) from user message
2. `search_products` tool → local JSON cache → ERP MySQL fallback
3. Validate discount against per-state maximums (`config.MAX_DISCOUNT_BY_STATE`)
4. `calculate_quote` tool → final pricing with optional "Condition of Payment" (CD) discount
5. `confirm_quote` tool → generate PDF via pdfkit → send to Telegram → summary to user

The agent prompt uses `---SPLIT---` markers to force multi-message replies.

### File download flow (catalog/video/packaging agents)

- Agent calls a download tool → file is placed in an in-memory map (`downloadedFiles` or `pendingPDFs`) keyed by session ID
- `setCurrentSession()` links the active Telegram chat to the session before the agent runs
- `telegram.ts` polls/detects the map entry and sends the file as a Telegram attachment
- Files are cached on disk for 24 h; a garbage-collection job runs hourly

### Key services (`src/services/`)

- `telegram.ts` — all bot event handlers and session orchestration (~700 lines)
- `sessionManager.ts` — user sessions, rate limiting, timeout tracking
- `authManager.ts` — two-step login flow (client code → password) validated against PostgreSQL `representatives` table; successful auth is stored in `authenticated_users` with a 30-day TTL
- `productCache.ts` — in-process LRU cache backed by a local JSON file; syncs from ERP MySQL on TTL expiry
- `pdfGenerator.ts` — pdfkit quote layout
- `audioTranscription.ts` — voice messages → OpenAI Whisper → text passed to agent

### Databases

**PostgreSQL** (`src/database/db.ts`): sessions, authenticated_users, representatives, telegram_file_cache. Tables are created on startup if missing.

**MySQL ERP** (optional, read-only): `VW_PRODUTOS` view — product code, name, price, unit, department. Required for real pricing; bot degrades gracefully if unavailable.

### Concurrency & reliability

- `utils/concurrency.ts` — semaphore capping OpenAI API calls at 3 concurrent requests
- `utils/retry.ts` — exponential backoff for external calls
- Global `uncaughtException` / `unhandledRejection` handlers in `app.ts` keep the process alive

### Environment variables

Required in `.env`:

```
TELEGRAM_BOT_TOKEN
OPENAI_API_KEY
TENANT_ID / CLIENT_ID / CLIENT_SECRET   # Azure MSAL for OneDrive
PG_HOST / PG_PORT / PG_USER / PG_PASSWORD / PG_DATABASE
```

Optional (ERP sync):
```
ERP_MYSQL_HOST / ERP_MYSQL_PORT / ERP_MYSQL_USER / ERP_MYSQL_PASSWORD / ERP_MYSQL_DATABASE
```

Tuning knobs (have defaults):
```
SESSION_TIMEOUT_MS        # default 600000 (10 min)
AUTH_TTL_MS               # default 2592000000 (30 days)
MAX_MESSAGES_PER_MINUTE   # default 20
PRODUCT_CACHE_TTL_HOURS   # default 24
```
