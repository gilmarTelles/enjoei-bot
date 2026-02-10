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
  const keywords = db.listKeywords();
  if (keywords.length === 0) {
    console.log('[check] Nenhuma palavra-chave, pulando.');
    return;
  }

  const subscribers = db.listSubscribers();
  if (subscribers.length === 0) {
    console.log('[check] Nenhum inscrito, pulando.');
    return;
  }

  console.log(`[check] Verificando ${keywords.length} palavra(s)-chave para ${subscribers.length} inscrito(s)...`);

  for (const keyword of keywords) {
    try {
      console.log(`[check] Buscando: "${keyword}"`);
      const products = await scraper.searchProducts(keyword);
      console.log(`[check] ${products.length} produto(s) para "${keyword}"`);

      const newProducts = products.filter(p => !db.isProductSeen(p.id, keyword));
      console.log(`[check] ${newProducts.length} novo(s) para "${keyword}"`);

      for (const product of newProducts) {
        db.markProductSeen(product, keyword);
      }

      if (newProducts.length > 0) {
        for (const chatId of subscribers) {
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

  // Inicializar banco de dados
  db.init();
  console.log('[bot] Banco de dados inicializado.');

  // Adicionar palavra-chave padrao
  db.addKeyword('ceni');

  // Inicializar bot Telegram
  const bot = telegram.init(TELEGRAM_BOT_TOKEN);

  // Registrar comandos
  commands.setCheckCallback(runCheck);
  commands.register(bot);
  console.log('[bot] Comandos registrados.');

  // Iniciar navegador
  await scraper.launchBrowser();
  console.log('[bot] Navegador iniciado.');

  // Agendar verificacoes periodicas
  const cronExpr = `*/${CHECK_INTERVAL} * * * *`;
  cron.schedule(cronExpr, () => {
    console.log(`[cron] Verificacao agendada`);
    runCheck().catch(err => console.error('[cron] Erro:', err.message));
  });
  console.log(`[bot] Verificacoes agendadas a cada ${CHECK_INTERVAL} minutos.`);

  console.log('[bot] Bot rodando. Ctrl+C para parar.');
}

// Encerramento gracioso
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
