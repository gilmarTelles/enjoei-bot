require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const cron = require('node-cron');
const db = require('./db');
const whatsapp = require('./whatsapp');
const commands = require('./commands');
const scraper = require('./scraper');
const { notifyNewProducts } = require('./notifier');

const PHONE_NUMBER = process.env.PHONE_NUMBER;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL, 10) || 30;

if (!PHONE_NUMBER) {
  console.error('Error: PHONE_NUMBER is required in .env');
  process.exit(1);
}

const OWNER_CHAT_ID = `${PHONE_NUMBER}@c.us`;

async function runCheck() {
  const keywords = db.listKeywords();
  if (keywords.length === 0) {
    console.log('[check] No keywords configured, skipping.');
    return;
  }

  console.log(`[check] Checking ${keywords.length} keyword(s)...`);

  for (const keyword of keywords) {
    try {
      console.log(`[check] Searching for: "${keyword}"`);
      const products = await scraper.searchProducts(keyword);
      console.log(`[check] Found ${products.length} product(s) for "${keyword}"`);

      const newProducts = products.filter(p => !db.isProductSeen(p.id, keyword));
      console.log(`[check] ${newProducts.length} new product(s) for "${keyword}"`);

      for (const product of newProducts) {
        db.markProductSeen(product, keyword);
      }

      if (newProducts.length > 0) {
        await notifyNewProducts(newProducts, keyword, OWNER_CHAT_ID);
      }

      // Delay between keywords to be polite to the server
      if (keywords.indexOf(keyword) < keywords.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (err) {
      console.error(`[check] Error checking "${keyword}":`, err.message);
    }
  }

  console.log('[check] Done.');
}

async function main() {
  console.log('[bot] Starting Enjoei WhatsApp Alert Bot...');

  // Initialize database
  db.init();
  console.log('[bot] Database initialized.');

  // Launch browser for scraping
  await scraper.launchBrowser();
  console.log('[bot] Browser launched.');

  // Start WhatsApp client
  console.log('[bot] Connecting to WhatsApp...');
  await whatsapp.start();

  // Register chat commands
  const client = whatsapp.getClient();
  commands.register(client, PHONE_NUMBER);
  commands.setCheckCallback(runCheck);
  console.log('[bot] Commands registered.');

  // Schedule periodic checks
  const cronExpr = `*/${CHECK_INTERVAL} * * * *`;
  cron.schedule(cronExpr, () => {
    console.log(`[cron] Triggered scheduled check`);
    runCheck().catch(err => console.error('[cron] Check error:', err.message));
  });
  console.log(`[bot] Scheduled checks every ${CHECK_INTERVAL} minutes.`);

  // Send startup message
  await whatsapp.sendMessage(OWNER_CHAT_ID, 'Enjoei Alert Bot is online! Send "help" for commands.');

  console.log('[bot] Bot is running. Press Ctrl+C to stop.');
}

// Graceful shutdown
async function shutdown() {
  console.log('\n[bot] Shutting down...');
  await scraper.closeBrowser();
  const client = whatsapp.getClient();
  if (client) {
    await client.destroy().catch(() => {});
  }
  const dbInstance = db.getDb();
  if (dbInstance) {
    dbInstance.close();
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error('[bot] Fatal error:', err);
  process.exit(1);
});
