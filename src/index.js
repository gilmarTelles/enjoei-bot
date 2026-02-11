require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const cron = require('node-cron');
const db = require('./db');
const telegram = require('./telegram');
const commands = require('./commands');
const scraper = require('./scraper');
const { notifyNewProducts } = require('./notifier');
const { getPlatform, DEFAULT_PLATFORM } = require('./platforms');
const { filterByRelevance } = require('./relevanceFilter');
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

function parseFiltersJson(filtersStr) {
  if (!filtersStr) return null;
  try {
    const obj = JSON.parse(filtersStr);
    return Object.keys(obj).length > 0 ? obj : null;
  } catch {
    return null;
  }
}

async function runCheck() {
  const allUserKeywords = db.getAllUserKeywords();
  if (allUserKeywords.length === 0) {
    console.log('[check] Nenhuma palavra-chave de nenhum usuario, pulando.');
    return { totalNew: 0, byPlatform: {} };
  }

  // Filter out keywords belonging to paused users
  const pausedSet = new Set();
  const chatIds = [...new Set(allUserKeywords.map(k => k.chat_id))];
  for (const cid of chatIds) {
    if (db.isPaused(cid)) pausedSet.add(cid);
  }
  const activeKeywords = allUserKeywords.filter(k => !pausedSet.has(k.chat_id));
  if (activeKeywords.length === 0) {
    console.log('[check] Todos os usuarios estao pausados, pulando.');
    return { totalNew: 0, byPlatform: {} };
  }

  // Group by platform + keyword + filters combo to avoid duplicate scrapes
  const scrapeGroupMap = {};
  for (const { id, chat_id, keyword, max_price, filters, platform } of activeKeywords) {
    const plat = platform || DEFAULT_PLATFORM;
    const parsedFilters = parseFiltersJson(filters);
    const filtersKey = parsedFilters ? JSON.stringify(parsedFilters) : '';
    const groupKey = `${plat}||${keyword}||${filtersKey}`;
    if (!scrapeGroupMap[groupKey]) {
      scrapeGroupMap[groupKey] = { keyword, filters: parsedFilters, platform: plat, users: [] };
    }
    scrapeGroupMap[groupKey].users.push({ chatId: chat_id, maxPrice: max_price });
  }

  const groups = Object.values(scrapeGroupMap);
  console.log(`[check] Verificando ${groups.length} grupo(s) de busca...`);

  let totalNewProducts = 0;
  const byPlatform = {};
  let allEmpty = true;

  for (let i = 0; i < groups.length; i++) {
    const { keyword, filters, platform, users } = groups[i];
    const platformModule = getPlatform(platform);
    const platformLabel = platformModule ? platformModule.platformName : platform;

    try {
      const filtersLabel = filters ? ` (filtros: ${JSON.stringify(filters)})` : '';
      console.log(`[check] Buscando: "${keyword}" [${platformLabel}]${filtersLabel}`);
      const products = await scraper.searchProducts(keyword, filters, platform);
      console.log(`[check] ${products.length} produto(s) para "${keyword}" [${platformLabel}]`);

      if (products.length > 0) allEmpty = false;

      // For each user watching this keyword+filters combo
      for (const { chatId, maxPrice } of users) {
        // Filter by price if user set a max_price
        let filtered = products;
        if (maxPrice) {
          filtered = products.filter(p => {
            const price = parsePrice(p.price);
            return price !== null && price <= maxPrice;
          });
        }

        // AI relevance filter
        try {
          filtered = await filterByRelevance(filtered, keyword);
        } catch (err) {
          console.error(`[check] Erro no filtro de relevancia: ${err.message}`);
          await notifyAdmin(`Erro no filtro de relevancia para "${keyword}": ${err.message}`);
        }

        const newProducts = [];
        for (const product of filtered) {
          if (!db.isProductSeen(product.id, keyword, chatId, platform)) {
            newProducts.push(product);
            db.markProductSeen(product, keyword, chatId, platform);
          }
        }

        if (newProducts.length > 0) {
          console.log(`[check] ${newProducts.length} novo(s) para "${keyword}" [${platformLabel}] -> usuario ${chatId}`);
          totalNewProducts += newProducts.length;
          byPlatform[platform] = (byPlatform[platform] || 0) + newProducts.length;
          await notifyNewProducts(newProducts, keyword, chatId, platform);
        }
      }

      // Rate limiting between scrapes
      if (i < groups.length - 1) {
        await new Promise(r => setTimeout(r, SCRAPE_DELAY_MS));
      }
    } catch (err) {
      // Platform-isolated error: warn admin but continue with other platforms/keywords
      console.error(`[check] Erro em "${keyword}" [${platformLabel}]:`, err.message);
      await notifyAdmin(`Erro ao buscar "${keyword}" [${platformLabel}]: ${err.message}`);
    }
  }

  // Stale selector detection
  if (allEmpty && groups.length > 0) {
    consecutiveEmptyChecks++;
    console.warn(`[check] Todas as buscas vazias (${consecutiveEmptyChecks}x consecutivas)`);
    if (consecutiveEmptyChecks >= STALE_THRESHOLD) {
      await notifyAdmin(`ALERTA: ${consecutiveEmptyChecks} verificacoes consecutivas sem resultados. Os seletores CSS podem ter mudado!`);
    }
  } else {
    consecutiveEmptyChecks = 0;
  }

  // Update status for /status command
  const now = new Date();
  const timeStr = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  commands.setStatusData({
    lastCheckTime: timeStr,
    keywordsChecked: groups.length,
    newProductsFound: totalNewProducts,
  });

  console.log(`[check] Concluido. ${totalNewProducts} novo(s).`);

  return { totalNew: totalNewProducts, byPlatform };
}

async function main() {
  console.log('[bot] Iniciando Bot de Buscas (Telegram)...');

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
