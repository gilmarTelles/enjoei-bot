require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cron = require('node-cron');
const db = require('./db');
const whatsapp = require('./whatsapp');
const commands = require('./commands');
const scraper = require('./scraper');
const { notifyNewProducts } = require('./notifier');

const PHONE_NUMBER = process.env.PHONE_NUMBER;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL, 10) || 30;
const PORT = parseInt(process.env.PORT, 10) || 3000;

if (!PHONE_NUMBER) {
  console.error('Error: PHONE_NUMBER is required in .env');
  process.exit(1);
}

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
        await notifyNewProducts(newProducts, keyword, PHONE_NUMBER);
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
  console.log('[bot] Starting Enjoei WhatsApp Alert Bot (Twilio)...');

  // Initialize database
  db.init();
  console.log('[bot] Database initialized.');

  // Initialize Twilio client
  whatsapp.init();

  // Set up command check callback
  commands.setCheckCallback(runCheck);

  // Launch browser for scraping
  await scraper.launchBrowser();
  console.log('[bot] Browser launched.');

  // Set up Express webhook for incoming WhatsApp messages
  const app = express();
  app.use(express.urlencoded({ extended: false }));

  app.post('/webhook', (req, res) => {
    const from = req.body.From || '';   // e.g., "whatsapp:+5541985105151"
    const body = req.body.Body || '';

    console.log(`[webhook] Message from ${from}: ${body}`);
    commands.handleMessage(from, body).catch(err => {
      console.error('[webhook] Error handling message:', err.message);
    });

    // Respond with empty TwiML (Twilio expects a response)
    res.type('text/xml').send('<Response></Response>');
  });

  app.get('/health', (req, res) => {
    res.send('OK');
  });

  app.listen(PORT, () => {
    console.log(`[bot] Webhook server listening on port ${PORT}`);
  });

  // Schedule periodic checks
  const cronExpr = `*/${CHECK_INTERVAL} * * * *`;
  cron.schedule(cronExpr, () => {
    console.log(`[cron] Triggered scheduled check`);
    runCheck().catch(err => console.error('[cron] Check error:', err.message));
  });
  console.log(`[bot] Scheduled checks every ${CHECK_INTERVAL} minutes.`);

  // Send startup message
  await whatsapp.sendMessage(PHONE_NUMBER, 'Enjoei Alert Bot is online! Send "help" for commands.');

  console.log('[bot] Bot is running. Press Ctrl+C to stop.');
}

// Graceful shutdown
async function shutdown() {
  console.log('\n[bot] Shutting down...');
  await scraper.closeBrowser();
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
