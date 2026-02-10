require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const cron = require('node-cron');
const db = require('./db');
const telegram = require('./telegram');
const commands = require('./commands');
const scraper = require('./scraper');
const { notifyNewProducts } = require('./notifier');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL, 10) || 5;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Erro: TELEGRAM_BOT_TOKEN obrigatorio no .env');
  process.exit(1);
}

async function runCheck() {
  const allUserKeywords = db.getAllUserKeywords();
  if (allUserKeywords.length === 0) {
    console.log('[check] Nenhuma palavra-chave de nenhum usuario, pulando.');
    return;
  }

  // Group keywords by unique keyword to avoid scraping the same word multiple times
  const keywordMap = {};
  for (const { chat_id, keyword } of allUserKeywords) {
    if (!keywordMap[keyword]) keywordMap[keyword] = [];
    keywordMap[keyword].push(chat_id);
  }

  console.log(`[check] Verificando ${Object.keys(keywordMap).length} palavra(s)-chave...`);

  const keywords = Object.keys(keywordMap);
  for (const keyword of keywords) {
    try {
      console.log(`[check] Buscando: "${keyword}"`);
      const products = await scraper.searchProducts(keyword);
      console.log(`[check] ${products.length} produto(s) para "${keyword}"`);

      // For each user watching this keyword
      for (const chatId of keywordMap[keyword]) {
        const newProducts = products.filter(p => !db.isProductSeen(p.id, keyword, chatId));

        if (newProducts.length > 0) {
          console.log(`[check] ${newProducts.length} novo(s) para "${keyword}" -> usuario ${chatId}`);
          for (const product of newProducts) {
            db.markProductSeen(product, keyword, chatId);
          }
          await notifyNewProducts(newProducts, keyword, chatId);
        }
      }

      if (keywords.indexOf(keyword) < keywords.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (err) {
      console.error(`[check] Erro em "${keyword}":`, err.message);
    }
  }

  console.log('[check] Concluido.');
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
