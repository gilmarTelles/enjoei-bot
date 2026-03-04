# Changelog

## 2026-03-04: Fix product ID deduplication regression

**Commit:** `812eeb3`

**Problem:** Previous commit changed product ID priority from path-first (`slug || node.id`) to numeric-first (`node.id || slug`). Products already stored in `seen_products` with path-based IDs (e.g. `"camisa-selecao-brasileira-nike-infantil-10-137860269"`) would not match the new numeric IDs (e.g. `"137860269"`), causing already-seen products to be re-sent as notifications.

**Changes to `src/enjoeiApi.js`:**
- Reverted `id` field in `normalizeProduct` back to `slug || String(node.id || '')` (path takes priority)

**Changes to `tests/platforms/enjoei.test.js`:**
- Added test verifying path takes priority over numeric id when both exist

**How found:** Code review agent flagged the ID precedence reversal as a deduplication break.

**Also:** Updated CLAUDE.md to remove stale `SWEEP_HOURS` env var documentation and add `ENJOEI_CITY`/`ENJOEI_STATE`.

---

## 2026-03-04: Match real Enjoei GraphQL API parameters

**Commit:** `28734d8`

**Problem:** The bot's API calls to Enjoei's GraphQL search endpoint did not match what the real website sends. Differences in timestamp format, missing location params, and unwired filters meant search results could differ from what a browser user sees.

**Changes to `src/enjoeiApi.js`:**

1. **Timestamp format** — Changed from UTC (`2026-01-01T00:00:00Z`) to Brazil timezone offset (`2025-12-31T21:00:00-03:00`). Added `formatBrazilTimestamp()` helper. The API expects `-03:00` offset, not `Z`.

2. **Location params** — Added `city` and `state` query params. Defaults to `sao-jose-dos-pinhais` / `pr`. Configurable via `ENJOEI_CITY` and `ENJOEI_STATE` env vars.

3. **`lp` filter wired to API** — The period filter (24h/7d/14d/30d) from the Telegram keyboard now converts to a `last_published_at` timestamp. Previously it was only used in the website URL builder but never sent to the API. Default is 24h.

4. **`search_context` corrected** — Changed from `products_search` to `products_search_default` to match the real site.

5. **Product normalization updated:**
   - `seller` now reads from `node.store.displayable.name` (was `node.user.name` which doesn't exist in the API response)
   - `title` always reads from `node.title.name` (the API returns an object, not a string)
   - Removed `photo.url` fallback (API always uses `image_public_id`)
   - `id` uses `node.id` as primary (numeric), with `path` as fallback

**How verified:** Captured real network requests from enjoei.com.br using Playwright, compared param-by-param, and tested the corrected params against the live API to confirm 30 results returned.

---

## 2026-03-04: Fix null platform crash and simplify startup sweep

**Commit:** `02810f7`

**Problem:** Two issues:
1. A keyword saved with platform `ml` (Mercado Livre, which is disabled) caused `Cannot read properties of null (reading 'searchProducts')` crash every 2 seconds in the polling loop.
2. The startup history sweep used 15-minute time windows over 24 hours, making many API calls. If any failed, the first polling pass would send all found products as new notifications (flooding the user).

**Changes to `src/index.js`:**

1. **Null platform guard in `runCheck()`** — Added `if (!platformModule) { continue; }` before calling `platformModule.searchProducts()`. Unknown platforms are logged and skipped instead of crashing.

2. **Simplified `runHistorySweep()`** — Replaced the 15-minute window loop with a single `searchProducts()` call per keyword group (same search the polling loop uses). Marks all current results as seen, then polling only notifies on genuinely new products. Removed unused `SWEEP_HOURS` constant.

**Also:** Manually removed orphaned `ml` keyword from production DB (`camisa rogério ceni` for chat `7653440251`).
