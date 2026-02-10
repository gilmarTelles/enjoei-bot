require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const cron = require('node-cron');
const db = require('./db');
const telegram = require('./telegram');
const commands = require('./commands');
const scraper = require('./scraper');
const { notifyNewProducts, notifyPriceDrop } = require('./notifier');
const { parsePrice } = commands;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL, 10) || 5;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '';
const SCRAPE_DELAY_MS = 3000;
const PURGE_DAYS = 7;
const STALE_THRESHOLD = 3;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Erro: TELEGRAM_BOT_TOKEN obrigatorio no .env');
  process.exit(1);
}

let consecutiveEmptyChecks = 0;

async function notifyAdmin(text) {
  if (!ADMIN_CHAT_ID) return;
  try {
    await telegram.sendMessage(ADMIN_CHAT_ID, `[Admin] ${text}`);
  } catch (err) {
    console.error('[admin] Falha ao notificar admin:', err.message);
  }
}

async function runMaintenance() {
  try {
    const purged = db.purgeOldProducts(PURGE_DAYS);
    console.log(`[maintenance] ${purged} produto(s) antigo(s) removido(s) (>${PURGE_DAYS} dias)`);

    const backupPath = db.backupDb();
    console.log(`[maintenance] Backup salvo em ${backupPath}`);
  } catch (err) {
    console.error('[maintenance] Erro:', err.message);
    await notifyAdmin(`Erro na manutencao: ${err.message}`);
  }
}

async function runCheck() {
  const allUserKeywords = db.getAllUserKeywords();
  if (allUserKeywords.length === 0) {
    console.log('[check] Nenhuma palavra-chave de nenhum usuario, pulando.');
    return;
  }

  // Group keywords by unique keyword to avoid scraping the same word multiple times
  // Also track max_price per user for filtering
  const keywordMap = {};
  for (const { chat_id, keyword, max_price } of allUserKeywords) {
    if (!keywordMap[keyword]) keywordMap[keyword] = [];
    keywordMap[keyword].push({ chatId: chat_id, maxPrice: max_price });
  }

  const keywords = Object.keys(keywordMap);
  console.log(`[check] Verificando ${keywords.length} palavra(s)-chave...`);

  let totalNewProducts = 0;
  let totalPriceDrops = 0;
  let allEmpty = true;

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    try {
      console.log(`[check] Buscando: "${keyword}"`);
      const products = await scraper.searchProducts(keyword);
      console.log(`[check] ${products.length} produto(s) para "${keyword}"`);

      if (products.length > 0) allEmpty = false;

      // For each user watching this keyword
      for (const { chatId, maxPrice } of keywordMap[keyword]) {
        // Filter by price if user set a max_price
        let filtered = products;
        if (maxPrice) {
          filtered = products.filter(p => {
            const price = parsePrice(p.price);
            return price !== null && price <= maxPrice;
          });
        }

        const newProducts = [];
        for (const product of filtered) {
          if (!db.isProductSeen(product.id, keyword, chatId)) {
            newProducts.push(product);
            db.markProductSeen(product, keyword, chatId);
          } else {
            // Check for price drops on already-seen products
            const oldPriceStr = db.getSeenProductPrice(product.id, keyword, chatId);
            const oldPrice = parsePrice(oldPriceStr);
            const newPrice = parsePrice(product.price);
            if (oldPrice && newPrice && newPrice < oldPrice) {
              console.log(`[check] Queda de preco: "${product.id}" ${oldPriceStr} -> ${product.price}`);
              db.updateSeenProductPrice(product.id, keyword, chatId, product.price);
              await notifyPriceDrop(product, keyword, chatId, oldPriceStr, product.price);
              totalPriceDrops++;
            }
          }
        }

        if (newProducts.length > 0) {
          console.log(`[check] ${newProducts.length} novo(s) para "${keyword}" -> usuario ${chatId}`);
          totalNewProducts += newProducts.length;
          await notifyNewProducts(newProducts, keyword, chatId);
        }
      }

      // Rate limiting between scrapes
      if (i < keywords.length - 1) {
        await new Promise(r => setTimeout(r, SCRAPE_DELAY_MS));
      }
    } catch (err) {
      console.error(`[check] Erro em "${keyword}":`, err.message);
      await notifyAdmin(`Erro ao buscar "${keyword}": ${err.message}`);
    }
  }

  // Stale selector detection
  if (allEmpty && keywords.length > 0) {
    consecutiveEmptyChecks++;
    console.warn(`[check] Todas as buscas vazias (${consecutiveEmptyChecks}x consecutivas)`);
    if (consecutiveEmptyChecks >= STALE_THRESHOLD) {
      await notifyAdmin(`ALERTA: ${consecutiveEmptyChecks} verificacoes consecutivas sem resultados. Os seletores CSS do enjoei podem ter mudado!`);
    }
  } else {
    consecutiveEmptyChecks = 0;
  }

  // Update status for /status command
  const now = new Date();
  const timeStr = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  commands.setStatusData({
    lastCheckTime: timeStr,
    keywordsChecked: keywords.length,
    newProductsFound: totalNewProducts,
    priceDrops: totalPriceDrops,
  });

  console.log(`[check] Concluido. ${totalNewProducts} novo(s), ${totalPriceDrops} queda(s) de preco.`);
}

async function main() {
  console.log('[bot] Iniciando Bot Enjoei (Telegram)...');

  db.init();
  console.log('[bot] Banco de dados inicializado.');

  const bot = telegram.init(TELEGRAM_BOT_TOKEN);

  commands.setCheckCallback(runCheck);
  commands.register(bot);
  console.log('[bot] Comandos registrados.');

  await scraper.launchBrowser();
  console.log('[bot] Navegador iniciado.');

  const cronExpr = `*/${CHECK_INTERVAL} * * * *`;
  cron.schedule(cronExpr, () => {
    console.log(`[cron] Verificacao agendada`);
    runCheck().catch(err => console.error('[cron] Erro:', err.message));
  });
  console.log(`[bot] Verificacoes agendadas a cada ${CHECK_INTERVAL} minutos.`);

  // Daily maintenance at 4 AM: purge old products + backup DB
  cron.schedule('0 4 * * *', () => {
    console.log('[cron] Manutencao diaria');
    runMaintenance().catch(err => console.error('[cron] Erro manutencao:', err.message));
  });
  console.log('[bot] Manutencao diaria agendada (4h).');

  console.log('[bot] Bot rodando. Ctrl+C para parar.');
}

async function shutdown() {
  console.log('\n[bot] Encerrando...');
  await scraper.closeBrowser();
  const botInstance = telegram.getBot();
  if (botInstance) {
    botInstance.stopPolling();
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
  console.error('[bot] Erro fatal:', err);
  process.exit(1);
});
