# AGENTS.md

Project instructions for AI agents working on this codebase.

## Project Overview

Telegram bot (named "enjoei-bot") that monitors the Enjoei marketplace (enjoei.com.br) for new product listings matching user-defined keywords. Sends alerts via Telegram with product details (photo, price, link). Includes optional AI-powered relevance filtering via Claude API. Multi-platform architecture exists but only Enjoei is currently active.

## Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm start` | Run the bot (`node src/index.js`) |
| `npm test` | Run Jest test suite |
| `npm run lint` | Lint with ESLint (`eslint src/ tests/`) |
| `npm run format` | Format with Prettier |
| `npx jest tests/<file>.test.js` | Run a single test file |

Production deployment uses PM2 and SSH (see `ecosystem.config.js`).

## Stack

- **Runtime**: Node.js 18+ (uses built-in `fetch`)
- **Language**: Plain JavaScript (no TypeScript)
- **Tests**: Jest 30
- **Linting**: ESLint 9 + eslint-config-prettier
- **Formatting**: Prettier
- **Database**: SQLite via better-sqlite3 (WAL mode)
- **Telegram**: node-telegram-bot-api
- **AI**: @anthropic-ai/sdk (Claude, optional relevance filtering)
- **Scheduling**: node-cron
- **Config**: dotenv
- **Process manager**: PM2

## Architecture

### Module Layout

```
src/
  index.js          # Main orchestrator: init, polling loop, daily cron, graceful shutdown
  db.js              # SQLite layer (better-sqlite3, WAL mode, migrations via try/catch ALTER TABLE)
  telegram.js        # Telegram bot wrapper
  commands.js        # Bot command handlers (/adicionar, /remover, /listar, /buscar, /ajuda, etc.)
  notifier.js         # Format and send Telegram product notifications
  enjoeiApi.js       # Low-level Enjoei GraphQL API client (browser_id, retry, backoff)
  relevanceFilter.js # Optional Claude API filter (claude-3-5-haiku-latest, graceful degradation)
  metrics.js         # Metrics tracking
  cache.js           # Caching layer
  utils.js           # Shared helpers (parsePrice, parseFilters)
  platforms/
    index.js          # Platform registry + resolver
    enjoei.js         # Enjoei platform module (searchProducts, buildSearchUrl, etc.)

tests/
  commands.test.js
  db.test.js
  notifier.test.js
  matchesAllWords.test.js
  metrics.test.js
  relevanceFilter.test.js
  platforms/
    enjoei.test.js

data/                # Runtime data (gitignored): bot.db, browser_id.txt
```

### Key Patterns

- **Plugin-based platforms**: Each platform module exports `platformName`, `searchProducts`, `searchProductsSince`, `buildSearchUrl`. New platforms add a module + register in `src/platforms/index.js`.
- **Polling loop**: `runCheck()` runs every 5s (configurable via `POLL_TICK_MS`), groups keywords by platform+keyword+filters, searches in parallel batches (max `MAX_CONCURRENT_SEARCHES`).
- **History sweep**: On startup, marks all products from last 24h as seen (no notifications sent).
- **Platform isolation**: Errors in one platform don't crash checks for others.
- **Adaptive polling**: Groups with repeated empty results get longer intervals (`getGroupIntervalMs`).
- **Stale API detection**: If all searches return empty repeatedly, admin is notified.
- **Graceful degradation**: AI relevance filter fails silently, returning all products.
- **Database migrations**: Non-destructive, using `ALTER TABLE` wrapped in try/catch inside `db.init()`.

### Data Flow

1. User sends `/adicionar` command -> keyword stored in `keywords` table with optional filters and platform
2. Startup: `runHistorySweep()` searches each keyword group, marks found products as seen (no alerts)
3. Polling: `runCheck()` groups keywords, searches platforms, filters by relevance/AI/price, identifies unseen products
4. New products -> `notifyNewProducts()` sends Telegram alerts

### Database Tables

- `keywords`: User keywords with optional `max_price`, `filters` (JSON), `platform`
- `seen_products`: Tracks notified products per user/keyword/platform
- `user_settings`: Per-user settings (e.g., `paused`)

## Conventions

- All user-facing bot commands are in Portuguese (`/adicionar`, `/remover`, `/listar`, `/buscar`, `/ajuda`)
- Module pattern: CommonJS (`require`/`module.exports`), no ESM
- Tests mock `global.fetch` and Telegram bot; DB tests use in-memory SQLite
- Platform tests must not hit live endpoints
- Runtime data goes in `data/` (gitignored)
- Commit messages follow conventional commits style (e.g., `docs:`, `fix:`, `feat:`)

## Environment Variables

Required in `.env`:

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (required) |
| `ALLOWED_USERS` | Comma-separated Telegram chat IDs (required) |

Optional:

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_CHAT_ID` | - | Telegram chat ID for error notifications |
| `ANTHROPIC_API_KEY` | - | Claude API key for relevance filtering |
| `ENABLE_RELEVANCE_FILTER` | `false` | Enable AI filtering |
| `ENABLE_IMAGE_FILTER` | `false` | Enable image-based filtering |
| `POLL_TICK_MS` | `5000` | Milliseconds between polling cycles |
| `MAX_CONCURRENT_SEARCHES` | `5` | Max parallel API searches per cycle |
| `PROXY_URL` | - | HTTP/SOCKS proxy for API requests |
| `CF_COOLDOWN_MS` | `300000` | Cloudflare block cooldown |
| `CF_MAX_COOLDOWN_MS` | `3600000` | Max Cloudflare cooldown |
| `CF_ALERT_THROTTLE_MS` | `600000` | Throttle for CF alerts |
| `REQUEST_JITTER_MS` | `2000` | Jitter for requests |
| `BROWSER_ID_ROTATE_MS` | `1800000` | How often to rotate browser_id |
| `CACHE_TTL_MS` | `30000` | Search result cache TTL |
| `ENJOEI_CITY` | `sao-jose-dos-pinhais` | City for search relevance |
| `ENJOEI_STATE` | `pr` | State for search relevance |
| `SSH_SERVER` | - | Production server SSH address |
| `SSH_PROJECT_DIR` | `~/enjoei-bot` | Project path on production server |

## Security Notes

- **Never commit `.env`** - it contains `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`, and `ALLOWED_USERS`. The `.gitignore` excludes `.env`.
- **Never commit `data/`** - it contains `bot.db` (with user data) and `browser_id.txt`. Excluded in `.gitignore`.
- **Sanitize user input** - The `commands.js` module strips smart quotes, brackets, and special characters from keywords before DB insertion.
- **Proxy credentials** - `PROXY_URL` may contain auth; keep out of logs.
- **Run `gitleaks protect --staged --redact`** before committing to catch secrets.
- The `ALLOWED_USERS` restricts which Telegram users can interact with the bot.