require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const cron = require('node-cron');
const db = require('./db');
const telegram = require('./telegram');
const commands = require('./commands');
const { notifyNewProducts } = require('./notifier');
const { getPlatform, DEFAULT_PLATFORM } = require('./platforms');
const { filterByRelevance } = require('./relevanceFilter');
const enjoeiApi = require('./enjoeiApi');
const metrics = require('./metrics');
const { parsePrice, parseFilters } = require('./utils');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '';
const POLL_BASE_INTERVAL_MS = parseInt(process.env.POLL_BASE_INTERVAL_MS, 10) || 5000;
const POLL_MAX_INTERVAL_MS = parseInt(process.env.POLL_MAX_INTERVAL_MS, 10) || 30000;
const POLL_BATCH_SIZE = parseInt(process.env.POLL_BATCH_SIZE, 10) || 4;
const POLL_IDLE_SLOWDOWN_CYCLES = parseInt(process.env.POLL_IDLE_SLOWDOWN_CYCLES, 10) || 5;
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_SEARCHES, 10) || 5;
const PURGE_DAYS = 7;
const STALE_THRESHOLD = 5;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function matchesAllWords(title, keyword) {
  if (!title) return false;
  const normalizedTitle = stripAccents(title.toLowerCase());
  const words = stripAccents(keyword.toLowerCase()).split(/\s+/).filter(Boolean);
  return words.every((word) => {
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`);
    return regex.test(normalizedTitle);
  });
}

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Erro: TELEGRAM_BOT_TOKEN obrigatorio no .env');
  process.exit(1);
}

const groupEmptyCounts = new Map();
let checkRunning = false;
let pollTimeoutId = null;
let dailyNewProducts = 0;
let lastCheckTime = null;
let currentPollInterval = POLL_BASE_INTERVAL_MS;
let consecutiveEmptyCycles = 0;
let batchIndex = 0;

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

    const backupPath = await db.backupDb();
    console.log(`[maintenance] Backup salvo em ${backupPath}`);
  } catch (err) {
    console.error('[maintenance] Erro:', err.message);
    await notifyAdmin(`Erro na manutencao: ${err.message}`);
  }
}

function buildGroups(allUserKeywords) {
  const pausedSet = new Set();
  const chatIds = [...new Set(allUserKeywords.map((k) => k.chat_id))];
  for (const cid of chatIds) {
    if (db.isPaused(cid)) pausedSet.add(cid);
  }
  const activeKeywords = allUserKeywords.filter((k) => !pausedSet.has(k.chat_id));
  if (activeKeywords.length === 0) return [];

  const groupMap = {};
  for (const { id, chat_id, keyword, max_price, filters, platform } of activeKeywords) {
    const plat = platform || DEFAULT_PLATFORM;
    const parsedFilters = parseFilters(filters);
    const filtersKey = Object.keys(parsedFilters).length > 0 ? JSON.stringify(parsedFilters) : '';
    const groupKey = `${plat}||${keyword}||${filtersKey}`;
    if (!groupMap[groupKey]) {
      groupMap[groupKey] = { keyword, filters: parsedFilters, platform: plat, users: [] };
    }
    groupMap[groupKey].users.push({ chatId: chat_id, maxPrice: max_price });
  }

  return Object.values(groupMap);
}

async function runWithConcurrency(items, limit, fn) {
  const results = [];
  let index = 0;
  async function next() {
    const i = index++;
    if (i >= items.length) return;
    results[i] = await fn(items[i], i);
    await next();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
  return results;
}

async function processProducts(products, keyword, platform, users) {
  const platformModule = getPlatform(platform);
  const platformLabel = (platformModule && platformModule.platformName) || platform;

  let aiFiltered = products;
  try {
    aiFiltered = await filterByRelevance(products, keyword);
  } catch (err) {
    console.error(`[check] Erro no filtro de relevancia: ${err.message}`);
    await notifyAdmin(`Erro no filtro de relevancia para "${keyword}": ${err.message}`);
  }

  const beforeMatch = aiFiltered.length;
  const matchedProducts = aiFiltered.filter((p) => matchesAllWords(p.title, keyword));
  if (matchedProducts.length < beforeMatch) {
    console.log(
      `[check] Filtro de palavras exatas removeu ${beforeMatch - matchedProducts.length} produto(s) para "${keyword}"`,
    );
  }

  let totalNew = 0;

  for (const { chatId, maxPrice } of users) {
    let filtered = matchedProducts;
    if (maxPrice) {
      filtered = filtered.filter((p) => {
        const price = parsePrice(p.price);
        return price !== null && price <= maxPrice;
      });
    }

    const newProducts = [];
    for (const product of filtered) {
      if (!db.isProductSeen(product.id, keyword, chatId, platform)) {
        newProducts.push(product);
      }
    }

    if (newProducts.length > 0) {
      console.log(`[check] ${newProducts.length} novo(s) para "${keyword}" [${platformLabel}] -> usuario ${chatId}`);
      totalNew += newProducts.length;
      const notified = await notifyNewProducts(newProducts, keyword, chatId, platform);
      for (const product of notified) {
        db.markProductSeen(product, keyword, chatId, platform);
      }
    }
  }

  return totalNew;
}

async function runCheck() {
  if (checkRunning) {
    console.log('[check] Verificacao anterior ainda em andamento, pulando.');
    return null;
  }
  checkRunning = true;
  try {
    const allUserKeywords = db.getAllUserKeywords();
    if (allUserKeywords.length === 0) {
      console.log('[check] Nenhuma palavra-chave de nenhum usuario, pulando.');
      return { totalNew: 0, byPlatform: {} };
    }

    const allGroups = buildGroups(allUserKeywords);
    if (allGroups.length === 0) {
      console.log('[check] Todos os usuarios estao pausados, pulando.');
      return { totalNew: 0, byPlatform: {} };
    }

    const startIdx = (batchIndex * POLL_BATCH_SIZE) % allGroups.length;
    const isLastBatch = startIdx + POLL_BATCH_SIZE >= allGroups.length;
    let groups;
    if (startIdx + POLL_BATCH_SIZE >= allGroups.length) {
      groups = allGroups.slice(startIdx);
    } else {
      groups = allGroups.slice(startIdx, startIdx + POLL_BATCH_SIZE);
    }
    batchIndex++;

    const batchLabel =
      allGroups.length > POLL_BATCH_SIZE ? ` (batch ${groups.length}/${allGroups.length}, offset ${startIdx})` : '';
    console.log(`[check] Verificando ${groups.length} grupo(s)${batchLabel}...`);

    let totalNewProducts = 0;
    const byPlatform = {};
    let hadError = false;
    let cfSkipped = 0;

    await runWithConcurrency(groups, MAX_CONCURRENT, async ({ keyword, filters, platform, users }) => {
      const platformModule = getPlatform(platform);
      const platformLabel = platformModule ? platformModule.platformName : platform;

      if (!platformModule) {
        console.error(`[check] Plataforma desconhecida: "${platform}", pulando "${keyword}"`);
        return;
      }

      const groupKey = `${platform}||${keyword}||${filters ? JSON.stringify(filters) : ''}`;

      if (enjoeiApi.isCloudflareCooldown()) {
        cfSkipped++;
        return;
      }

      try {
        const filtersLabel = filters ? ` (filtros: ${JSON.stringify(filters)})` : '';
        console.log(`[check] Buscando: "${keyword}" [${platformLabel}]${filtersLabel}`);
        const products = await platformModule.searchProducts(keyword, filters);
        console.log(`[check] ${products.length} produto(s) para "${keyword}" [${platformLabel}]`);

        if (products.length > 0) {
          groupEmptyCounts.delete(groupKey);
        } else {
          groupEmptyCounts.set(groupKey, (groupEmptyCounts.get(groupKey) || 0) + 1);
          const count = groupEmptyCounts.get(groupKey);
          if (count >= STALE_THRESHOLD) {
            await notifyAdmin(
              `ALERTA: "${keyword}" [${platformLabel}] sem resultados ha ${count} verificacoes consecutivas.`,
            );
          }
        }

        const newCount = await processProducts(products, keyword, platform, users);
        totalNewProducts += newCount;
        if (newCount > 0) byPlatform[platform] = (byPlatform[platform] || 0) + newCount;
        metrics.recordSearch(keyword, platform, products.length, newCount);
      } catch (err) {
        hadError = true;
        console.error(`[check] Erro em "${keyword}" [${platformLabel}]:`, err.message);
        await notifyAdmin(`Erro ao buscar "${keyword}" [${platformLabel}]: ${err.message}`);
        metrics.recordSearch(keyword, platform, 0, 0, err.message);
        metrics.recordError(err.message);
      }
    });

    if (cfSkipped > 0) {
      console.log(`[check] ${cfSkipped} grupo(s) pulado(s) por Cloudflare cooldown.`);
    }

    if (!hadError && groups.length > 0 && [...groupEmptyCounts.values()].every((c) => c >= STALE_THRESHOLD)) {
      await notifyAdmin(
        `ALERTA: Todas as buscas sem resultados ha ${STALE_THRESHOLD}+ verificacoes. A API pode ter mudado!`,
      );
    }

    if (totalNewProducts > 0) {
      consecutiveEmptyCycles = 0;
      currentPollInterval = POLL_BASE_INTERVAL_MS;
    } else {
      consecutiveEmptyCycles++;
      if (consecutiveEmptyCycles >= POLL_IDLE_SLOWDOWN_CYCLES) {
        currentPollInterval = Math.min(currentPollInterval + POLL_BASE_INTERVAL_MS, POLL_MAX_INTERVAL_MS);
        if (currentPollInterval < POLL_MAX_INTERVAL_MS || consecutiveEmptyCycles === POLL_IDLE_SLOWDOWN_CYCLES) {
          console.log(
            `[check] Intervalo adaptativo: ${currentPollInterval}ms (ciclos vazios: ${consecutiveEmptyCycles})`,
          );
        }
      }
    }

    const now = new Date();
    lastCheckTime = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    commands.setStatusData({
      lastCheckTime,
      keywordsChecked: groups.length,
      newProductsFound: totalNewProducts,
    });

    dailyNewProducts += totalNewProducts;
    metrics.recordPollCycle(totalNewProducts > 0);
    console.log(`[check] Concluido. ${totalNewProducts} novo(s). Intervalo: ${currentPollInterval}ms`);
    return { totalNew: totalNewProducts, byPlatform };
  } finally {
    checkRunning = false;
  }
}

async function runHistorySweep() {
  const allUserKeywords = db.getAllUserKeywords();
  if (allUserKeywords.length === 0) {
    console.log('[sweep] Nenhuma palavra-chave, pulando sweep.');
    return;
  }

  const groups = buildGroups(allUserKeywords);
  if (groups.length === 0) {
    console.log('[sweep] Todos os usuarios pausados, pulando sweep.');
    return;
  }

  console.log(`[sweep] Marcando produtos existentes para ${groups.length} grupo(s)...`);

  await runWithConcurrency(groups, MAX_CONCURRENT, async ({ keyword, filters, platform, users }) => {
    const platformModule = getPlatform(platform);
    if (!platformModule) return;

    const platformLabel = platformModule.platformName;
    let totalSeen = 0;

    try {
      const searchFn = platformModule.searchProductsSweep || platformModule.searchProducts;
      const products = await searchFn(keyword, filters);

      for (const product of products) {
        for (const { chatId } of users) {
          if (!db.isProductSeen(product.id, keyword, chatId, platform)) {
            db.markProductSeen(product, keyword, chatId, platform);
            totalSeen++;
          }
        }
      }
    } catch (err) {
      console.error(`[sweep] Erro em "${keyword}" [${platformLabel}]: ${err.message}`);
    }

    console.log(`[sweep] "${keyword}" [${platformLabel}]: ${totalSeen} produto(s) marcado(s) como visto(s)`);
  });

  console.log('[sweep] Sweep concluido.');
}

function startPollingLoop() {
  async function poll() {
    try {
      await runCheck();
    } catch (err) {
      console.error('[poll] Erro:', err.message);
    }
    pollTimeoutId = setTimeout(poll, currentPollInterval);
  }
  pollTimeoutId = setTimeout(poll, currentPollInterval);
  console.log(
    `[bot] Polling iniciado (base: ${POLL_BASE_INTERVAL_MS}ms, batch: ${POLL_BATCH_SIZE}, max: ${POLL_MAX_INTERVAL_MS}ms).`,
  );
}

async function main() {
  console.log('[bot] Iniciando Bot de Buscas (Telegram)...');

  db.init();
  console.log('[bot] Banco de dados inicializado.');

  const bot = telegram.init(TELEGRAM_BOT_TOKEN);

  commands.setCheckCallback(runCheck);
  commands.setRuntimeStateGetter(() => ({
    allGroups: buildGroups(db.getAllUserKeywords()),
    groupEmptyCounts,
    currentPollInterval,
    batchIndex,
  }));
  commands.register(bot);
  console.log('[bot] Comandos registrados.');

  enjoeiApi.setAlertCallback((msg) => notifyAdmin(msg));

  await runHistorySweep();

  const allKw = db.getAllUserKeywords();
  const groups = buildGroups(allKw);
  await notifyAdmin(
    `Bot iniciado. Monitorando ${allKw.length} palavra(s)-chave em ${groups.length} grupo(s). Batch: ${POLL_BATCH_SIZE}, intervalo: ${POLL_BASE_INTERVAL_MS}ms.`,
  );

  startPollingLoop();

  cron.schedule('0 4 * * *', () => {
    console.log('[cron] Manutencao diaria');
    runMaintenance().catch((err) => console.error('[cron] Erro manutencao:', err.message));
  });

  cron.schedule('0 0 * * *', () => {
    dailyNewProducts = 0;
  });

  cron.schedule('0 */6 * * *', () => {
    const cycleInfo = lastCheckTime ? `Ultimo ciclo: ${lastCheckTime}` : 'Nenhum ciclo realizado';
    notifyAdmin(`Heartbeat: Bot rodando. ${cycleInfo}. ${dailyNewProducts} produto(s) novo(s) hoje.`).catch((err) =>
      console.error('[cron] Erro heartbeat:', err.message),
    );
  });

  console.log('[bot] Manutencao diaria agendada (4h). Heartbeat a cada 6h.');
  console.log('[bot] Bot rodando. Ctrl+C para parar.');
}

async function shutdown() {
  console.log('\n[bot] Encerrando...');
  if (pollTimeoutId) clearTimeout(pollTimeoutId);
  try {
    await notifyAdmin('Bot encerrando.');
  } catch {}
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

module.exports = { matchesAllWords, escapeRegex };
