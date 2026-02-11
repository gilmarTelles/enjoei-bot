# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Telegram bot that monitors Brazilian marketplace platforms (Enjoei, Mercado Livre, OLX) for new product listings matching user-defined keywords. Sends alerts via Telegram with product details including photo, price, and link. Includes AI-powered relevance filtering using Claude API.

## Common Commands

### Development
```bash
# Install dependencies
npm install

# Run the bot
npm start
# or
node src/index.js

# Run tests
npm test
```

### Production Server
```bash
# SSH into the server
ssh $SSH_SERVER

# Project directory on the server
cd ~/enjoei-bot

# Deploy latest changes (from server)
git pull && pm2 restart enjoei-bot

# Or deploy from local machine in one command
ssh $SSH_SERVER "cd enjoei-bot && git pull && pm2 restart enjoei-bot"

# View logs
ssh $SSH_SERVER "pm2 logs enjoei-bot"

# Check status
ssh $SSH_SERVER "pm2 status"
```

### PM2 Commands (on server)
```bash
pm2 start ecosystem.config.js
pm2 start src/index.js --name enjoei-bot
pm2 restart enjoei-bot
pm2 stop enjoei-bot
pm2 logs enjoei-bot
pm2 save
```

### Testing
```bash
# Run all tests
npm test

# Run specific test file
npx jest tests/db.test.js
npx jest tests/commands.test.js
```

## Architecture

### Multi-Platform Design

The bot uses a plugin-based architecture for marketplace platforms:

- **Platform Registry** (`src/platforms/index.js`): Central registry mapping platform keys to their modules
- **Platform Modules** (`src/platforms/`): Each platform (enjoei, mercadolivre, olx) implements:
  - `scrapePage(browser, keyword, filters)`: Search results scraping
  - `buildSearchUrl(keyword, filters)`: URL construction with filters
  - `platformName`: Human-readable platform name

### Core Components

1. **Main Orchestrator** (`src/index.js`)
   - Initializes database, browser, Telegram bot
   - Schedules two cron jobs:
     - Keyword search checks (every N minutes, configured via CHECK_INTERVAL)
     - Daily maintenance: purge old products + backup DB (4 AM)
   - Handles graceful shutdown (SIGINT/SIGTERM)

2. **Database Layer** (`src/db.js`)
   - SQLite with better-sqlite3, WAL mode enabled
   - Tables: `keywords`, `seen_products`, `user_settings`
   - Schema migrations handled in `init()` using try/catch around ALTER TABLE
   - Multi-platform support: UNIQUE constraints include platform column

3. **Scraper** (`src/scraper.js`)
   - Puppeteer-based with automatic browser restart every 24 hours
   - Retry mechanism: up to 3 attempts with exponential backoff
   - Browser launch args optimized for server environments (--no-sandbox, --single-process)
   - Delegates to platform-specific modules via `getPlatform()`

4. **Command Handler** (`src/commands.js`)
   - Telegram bot commands: `/adicionar`, `/remover`, `/listar`, `/buscar`, `/ajuda`, etc.
   - Interactive filters: buttons for selecting min_price, max_price, category
   - Supports platform selection via syntax like `palavra:enjoei` or `palavra:ml`

5. **Notifier** (`src/notifier.js`)
   - Formats and sends Telegram notifications for new products
   - Includes product images, prices, and direct links

6. **AI Relevance Filter** (`src/relevanceFilter.js`)
   - Optional Claude API integration (enabled via `ENABLE_RELEVANCE_FILTER=true`)
   - Uses `claude-3-5-haiku-latest` to filter out irrelevant search results
   - Gracefully degrades if API fails

### Data Flow

1. User adds keyword via `/adicionar` → stored in `keywords` table with optional filters and platform
2. Cron triggers `runCheck()` → groups keywords by platform+keyword+filters to avoid duplicate scrapes
3. For each group:
   - `scraper.searchProducts()` → delegates to platform module → returns products array
   - Filter by user's `max_price` if set
   - `filterByRelevance()` → AI filtering (if enabled)
   - Check `seen_products` table → identify new products
   - Send notifications via `notifyNewProducts()`

### Key Patterns

- **Platform Isolation**: Errors in one platform don't crash checks for other platforms
- **Stale Selector Detection**: If all scrapes return empty results N times consecutively, admin is notified (potential CSS selector breakage)
- **Rate Limiting**: 3-second delay between scrapes to avoid overwhelming target sites
- **Database Migrations**: Non-destructive migrations using `ALTER TABLE` with try/catch
- **Graceful Degradation**: AI relevance filter fails silently and returns all products

## Environment Variables

Required in `.env`:
```
TELEGRAM_BOT_TOKEN=your_token_here
CHECK_INTERVAL=5  # Minutes between keyword checks
```

Optional:
```
ADMIN_CHAT_ID=your_chat_id  # For error notifications
ANTHROPIC_API_KEY=your_key  # For AI relevance filtering
ENABLE_RELEVANCE_FILTER=true  # Enable AI filtering
PUPPETEER_EXECUTABLE_PATH=/path/to/chromium  # Custom browser path
```

## Adding a New Platform

1. Create `src/platforms/newplatform.js` implementing:
   ```javascript
   module.exports = {
     platformName: 'Platform Name',
     buildSearchUrl: (keyword, filters) => { /* return URL */ },
     scrapePage: async (browser, keyword, filters) => { /* return products array */ },
   };
   ```

2. Register in `src/platforms/index.js`:
   ```javascript
   const newplatform = require('./newplatform');
   const platforms = { enjoei, ml: mercadolivre, olx, newplatform };
   const PLATFORM_ALIASES = { ..., 'newplatform': 'newplatform' };
   ```

3. Add tests in `tests/platforms/`

## Database Schema Notes

- **keywords**: User's monitored keywords with optional `max_price`, `filters` (JSON), and `platform`
- **seen_products**: Tracks which products were already shown to each user per keyword+platform
- **user_settings**: Per-user settings like `paused` status
- UNIQUE constraints include `platform` to allow same keyword on different platforms

## Testing Notes

- Tests use Jest
- Mock Puppeteer browser and Telegram bot in tests
- Database tests create temporary in-memory DB
- Platform scraper tests should mock network requests to avoid hitting live sites
