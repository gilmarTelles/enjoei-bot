const db = require('./db');
const { sendMessage } = require('./telegram');
const { getPlatform, resolvePlatformAlias, DEFAULT_PLATFORM } = require('./platforms');
const { parseFilters, sanitizeKeyword } = require('./utils');
const metrics = require('./metrics');
const enjoeiApi = require('./enjoeiApi');

const KEYWORD_MIN_LEN = 2;
const KEYWORD_MAX_LEN = 50;
const MAX_KEYWORDS_PER_USER = 20;
const RATE_LIMIT_WINDOW_MS = 10000;
const RATE_LIMIT_MAX_REQUESTS = 5;

const rateLimitMap = new Map();

function checkRateLimit(chatId) {
  const now = Date.now();
  let entry = rateLimitMap.get(chatId);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry = { windowStart: now, count: 0 };
    rateLimitMap.set(chatId, entry);
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  if (rateLimitMap.size > 10000) {
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    for (const [key, val] of rateLimitMap) {
      if (val.windowStart < cutoff) rateLimitMap.delete(key);
    }
  }
  return true;
}

function getAllowedUsers() {
  return (process.env.ALLOWED_USERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllowed(msg) {
  return getAllowedUsers().includes(msg.chat.id.toString());
}

function isAllowedChat(chatId) {
  return getAllowedUsers().includes(chatId.toString());
}

let checkCallback = null;
let statusData = null;
let getRuntimeState = null;

function setCheckCallback(cb) {
  checkCallback = cb;
}

function setStatusData(data) {
  statusData = data;
}

function setRuntimeStateGetter(fn) {
  getRuntimeState = fn;
}

function isAdmin(chatId) {
  return (process.env.ADMIN_CHAT_ID || '').split(',').includes(chatId.toString());
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatFiltersSummary(filters, platform) {
  const platformKey = platform || DEFAULT_PLATFORM;
  const platformModule = getPlatform(platformKey);
  if (platformModule) {
    return platformModule.formatFiltersSummary(filters);
  }
  return '';
}

/**
 * Parse platform suffix from the argument string.
 * The platform alias can appear:
 *   - As the last word: "nike ml" -> keyword="nike", platform="ml"
 *   - As the last word after price: "nike < 200 ml" -> keyword="nike", maxPrice=200, platform="ml"
 * Only recognized if it resolves to a known platform alias.
 */
function parsePlatformFromArg(arg) {
  if (!arg) return { keyword: '', platform: DEFAULT_PLATFORM };

  const words = arg.trim().split(/\s+/);

  // Check if last two words form a platform alias (e.g. "mercado livre")
  if (words.length >= 3) {
    const lastTwo = words.slice(-2).join(' ').toLowerCase();
    const resolved = resolvePlatformAlias(lastTwo);
    if (resolved) {
      return {
        keyword: words.slice(0, -2).join(' '),
        platform: resolved,
      };
    }
  }

  // Check if last word is a platform alias (only if 2+ words)
  if (words.length >= 2) {
    const lastWord = words[words.length - 1].toLowerCase();
    const resolved = resolvePlatformAlias(lastWord);
    if (resolved) {
      return {
        keyword: words.slice(0, -1).join(' '),
        platform: resolved,
      };
    }
  }

  return { keyword: arg, platform: DEFAULT_PLATFORM };
}

function buildFilterKeyboard(keywordRow) {
  const platform = keywordRow.platform || DEFAULT_PLATFORM;
  const platformModule = getPlatform(platform);
  if (platformModule) {
    return platformModule.buildFilterKeyboard(keywordRow);
  }
  // Fallback to enjoei
  return getPlatform('enjoei').buildFilterKeyboard(keywordRow);
}

async function showKeywordSelector(bot, chatId) {
  const keywords = db.listKeywordsWithId(chatId);
  if (keywords.length === 0) {
    await sendMessage(chatId, 'Nenhuma palavra-chave configurada. Use /adicionar primeiro.');
    return;
  }
  if (keywords.length === 1) {
    await showFilterKeyboard(bot, chatId, keywords[0]);
    return;
  }
  const buttons = keywords.map((k) => {
    const platformModule = getPlatform(k.platform || DEFAULT_PLATFORM);
    const platformLabel = platformModule ? platformModule.platformName : k.platform;
    return [
      {
        text: `${k.keyword} (${platformLabel})`,
        callback_data: `fs:${k.id}`,
      },
    ];
  });
  await bot.sendMessage(chatId, 'Escolha a palavra-chave:', {
    reply_markup: { inline_keyboard: buttons },
  });
}

async function showFilterKeyboard(bot, chatId, keywordRow) {
  const keyboard = buildFilterKeyboard(keywordRow);
  const platformModule = getPlatform(keywordRow.platform || DEFAULT_PLATFORM);
  const platformLabel = platformModule ? platformModule.platformName : keywordRow.platform;
  await bot.sendMessage(chatId, `\u2699\uFE0F Filtros para "${keywordRow.keyword}" (${platformLabel}):`, {
    reply_markup: keyboard,
  });
}

function register(bot) {
  bot.on('message', async (msg) => {
    if (!msg.text) return;

    const chatId = msg.chat.id.toString();
    const text = msg.text.trim();

    if (!text.startsWith('/')) return;

    if (!isAllowed(msg)) {
      await sendMessage(chatId, 'Acesso negado.');
      return;
    }

    if (!checkRateLimit(chatId)) {
      await sendMessage(chatId, 'Muitas requisicoes. Aguarde alguns segundos e tente novamente.');
      return;
    }

    const parts = text.split(/\s+/);
    const command = parts[0].toLowerCase().replace(/@.*$/, ''); // remove @botname
    const arg = parts.slice(1).join(' ').trim();

    try {
      switch (command) {
        case '/adicionar': {
          if (!arg) {
            await sendMessage(
              chatId,
              'Uso: /adicionar <palavra> [< preco\\_max]\nExemplo: /adicionar nike air max\nExemplo: /adicionar nike < 200',
            );
            return;
          }

          const { keyword: rawKeyword, platform: addPlatform } = parsePlatformFromArg(arg);

          let keyword = rawKeyword;
          let maxPrice = null;
          const priceMatch = keyword.match(/^(.+?)\s*<\s*(\d+(?:[.,]\d+)?)\s*$/);
          if (priceMatch) {
            keyword = priceMatch[1].trim();
            maxPrice = parseFloat(priceMatch[2].replace(',', '.'));
          }
          keyword = sanitizeKeyword(keyword);

          if (keyword.length < KEYWORD_MIN_LEN) {
            await sendMessage(chatId, `Palavra-chave muito curta (minimo ${KEYWORD_MIN_LEN} caracteres).`);
            return;
          }
          if (keyword.length > KEYWORD_MAX_LEN) {
            await sendMessage(chatId, `Palavra-chave muito longa (maximo ${KEYWORD_MAX_LEN} caracteres).`);
            return;
          }
          if (maxPrice !== null && maxPrice <= 0) {
            await sendMessage(chatId, 'Preco maximo deve ser positivo.');
            return;
          }

          const keywordCount = db.countKeywords(chatId);
          if (keywordCount >= MAX_KEYWORDS_PER_USER) {
            await sendMessage(
              chatId,
              `Limite de ${MAX_KEYWORDS_PER_USER} palavras-chave atingido. Remova alguma antes de adicionar.`,
            );
            return;
          }

          const added = db.addKeyword(chatId, keyword, maxPrice, addPlatform);
          if (added) {
            const platformModule = getPlatform(addPlatform);
            const platformLabel = platformModule ? platformModule.platformName : addPlatform;
            let confirmMsg = `Palavra-chave adicionada: "${keyword.toLowerCase()}" (${platformLabel})`;
            if (maxPrice) confirmMsg += ` (max R$ ${maxPrice.toFixed(2).replace('.', ',')})`;
            confirmMsg += '\nUse /filtros para configurar filtros de busca.';
            await sendMessage(chatId, confirmMsg);
          } else {
            await sendMessage(chatId, `Palavra-chave "${keyword.toLowerCase()}" ja existe.`);
          }
          break;
        }

        case '/remover': {
          if (!arg) {
            await sendMessage(chatId, 'Uso: /remover <palavra>\nExemplo: /remover nike air max');
            return;
          }
          const { keyword: kw, platform: rmPlatform } = parsePlatformFromArg(arg);
          // Always remove from the parsed platform (defaults to enjoei if none specified)
          const removed = db.removeKeyword(chatId, kw, rmPlatform);
          const rmPlatformModule = getPlatform(rmPlatform);
          const rmLabel = rmPlatformModule ? rmPlatformModule.platformName : rmPlatform;
          if (removed) {
            await sendMessage(chatId, `Palavra-chave removida: "${kw.toLowerCase()}" (${rmLabel})`);
          } else {
            await sendMessage(chatId, `Palavra-chave "${kw.toLowerCase()}" nao encontrada no ${rmLabel}.`);
          }
          break;
        }

        case '/listar': {
          const keywords = db.listKeywords(chatId);
          if (keywords.length === 0) {
            await sendMessage(chatId, 'Nenhuma palavra-chave configurada. Use /adicionar <palavra> para comecar.');
          } else {
            const list = keywords
              .map((k, i) => {
                const platformModule = getPlatform(k.platform || DEFAULT_PLATFORM);
                const platformLabel = platformModule ? platformModule.platformName : k.platform;
                let line = `${i + 1}. ${k.keyword} (${platformLabel})`;
                if (k.max_price) line += ` (max R$ ${k.max_price.toFixed(2).replace('.', ',')})`;
                const filtersSummary = formatFiltersSummary(parseFilters(k.filters), k.platform);
                if (filtersSummary) line += filtersSummary;
                return line;
              })
              .join('\n');
            await sendMessage(chatId, `*Suas palavras-chave:*\n\n${list}`);
          }
          break;
        }

        case '/filtros': {
          if (arg) {
            const { keyword: fkw, platform: fplatform } = parsePlatformFromArg(arg);
            const keywords = db.listKeywordsWithId(chatId);
            const match = keywords.find((k) => k.keyword === fkw.toLowerCase().trim() && k.platform === fplatform);
            if (!match) {
              await sendMessage(chatId, `Palavra-chave "${fkw.toLowerCase()}" nao encontrada.`);
              return;
            }
            await showFilterKeyboard(bot, chatId, match);
          } else {
            await showKeywordSelector(bot, chatId);
          }
          break;
        }

        case '/buscar': {
          if (checkCallback) {
            const summary = await checkCallback();
            if (summary === null) {
              await sendMessage(chatId, 'Uma verificacao ja esta em andamento. Tente novamente em breve.');
            } else if (summary) {
              const platformParts = [];
              if (summary.byPlatform) {
                for (const [key, count] of Object.entries(summary.byPlatform)) {
                  if (count > 0) {
                    const pm = getPlatform(key);
                    platformParts.push(`${pm ? pm.platformName : key}: ${count}`);
                  }
                }
              }
              let summaryMsg = `Busca concluida: ${summary.totalNew} novo(s)`;
              if (platformParts.length > 0) {
                summaryMsg += ` (${platformParts.join(', ')})`;
              }
              await sendMessage(chatId, summaryMsg);
            } else {
              await sendMessage(chatId, 'Busca concluida.');
            }
          }
          break;
        }

        case '/parar': {
          db.setPaused(chatId, true);
          await sendMessage(chatId, 'Notificacoes pausadas. Use /retomar para reativar.');
          break;
        }

        case '/retomar': {
          db.setPaused(chatId, false);
          await sendMessage(chatId, 'Notificacoes reativadas.');
          break;
        }

        case '/status': {
          const paused = db.isPaused(chatId);
          if (!statusData) {
            const lines = [
              'Nenhuma verificacao realizada ainda.',
              '',
              `Notificacoes: ${paused ? 'pausadas' : 'ativas'}`,
            ];
            await sendMessage(chatId, lines.join('\n'));
          } else {
            const lines = [
              '*Status do Bot*',
              '',
              `Ultima verificacao: ${statusData.lastCheckTime}`,
              `Palavras-chave verificadas: ${statusData.keywordsChecked}`,
              `Novos produtos encontrados: ${statusData.newProductsFound}`,
              '',
              `Notificacoes: ${paused ? 'pausadas' : 'ativas'}`,
            ];
            await sendMessage(chatId, lines.join('\n'));
          }
          break;
        }

        case '/ajuda':
        case '/start':
        case '/help': {
          await sendMessage(
            chatId,
            [
              '*Bot de Buscas - Comandos*',
              '',
              '/adicionar <palavra> — Adicionar palavra-chave',
              '/adicionar <palavra> < preco — Com filtro de preco',
              '/remover <palavra> — Remover palavra-chave',
              '/listar — Ver suas palavras-chave',
              '/filtros — Configurar filtros de busca',
              '/buscar — Buscar agora',
              '/parar — Pausar notificacoes',
              '/retomar — Retomar notificacoes',
              '/status — Status da ultima verificacao',
              '/stats — Estatisticas do bot',
              '/historico — Ultimos produtos encontrados',
              '',
              '*Admin:*',
              '/saude — Saude e diagnostico',
              '/atividade — Atividade recente de buscas',
              '/config — Configuracoes do bot',
              '/grupos — Grupos de palavras-chave',
              '/resetar — Resetar cooldown Cloudflare',
              '',
              '/ajuda — Mostrar esta mensagem',
            ].join('\n'),
          );
          break;
        }

        case '/stats': {
          const isAdm = isAdmin(chatId);
          const targetChatId = isAdm ? null : chatId;
          const todayCount = db.getProductsCountSince(targetChatId, '-1 day');
          const weekCount = db.getProductsCountSince(targetChatId, '-7 days');
          const totalCount = db.getTotalProductsCount(targetChatId);
          const stats = metrics.getStats();
          const kwCount = db.countKeywords(chatId);
          const lines = [
            '*Estatisticas do Bot*',
            '',
            `Produtos encontrados (${isAdm ? 'geral' : 'voce'}):`,
            `  Hoje: ${todayCount} | Semana: ${weekCount} | Total: ${totalCount}`,
            '',
            `Palavras-chave: ${kwCount}`,
          ];
          if (isAdm) {
            lines.push(
              '',
              'API:',
              `  Sucesso: ${stats.apiSuccessRate !== null ? stats.apiSuccessRate + '%' : 'N/A'} | Falhas: ${stats.apiCalls.fail} | CF: ${stats.apiCalls.cfBlock} | 429: ${stats.apiCalls.rateLimit}`,
              `  Tempo medio: ${stats.avgResponseTime !== null ? stats.avgResponseTime + 'ms' : 'N/A'}`,
              `  Cache hit: ${stats.cacheHitRate !== null ? stats.cacheHitRate + '%' : 'N/A'}`,
              '',
              `Uptime: ${stats.uptime}`,
              `Ciclos: ${stats.pollCycles.total} (${stats.pollCycles.empty} vazios)`,
            );
          }
          await sendMessage(chatId, lines.join('\n'));
          break;
        }

        case '/historico': {
          const recent = db.getRecentProducts(chatId, 10);
          if (recent.length === 0) {
            await sendMessage(chatId, 'Nenhum produto encontrado ainda.');
          } else {
            const lines = ['*Ultimos 10 produtos:*', ''];
            recent.forEach((p, i) => {
              const timeStr = p.first_seen_at || '?';
              lines.push(`${i + 1}. ${p.title || 'Sem titulo'}`);
              lines.push(`   ${p.price || 'N/A'} | ${timeStr} | "${p.keyword}"`);
            });
            await sendMessage(chatId, lines.join('\n'));
          }
          break;
        }

        case '/saude': {
          if (!isAdmin(chatId)) {
            await sendMessage(chatId, 'Acesso negado. Comando restrito ao admin.');
            break;
          }
          const health = metrics.getHealth();
          const dbSize = db.getDbSize();
          const mem = process.memoryUsage();
          const cfLabel = health.cfBlocked ? 'BLOQUEADO' : 'OK';
          const cfExtra = health.cfBlocked
            ? ` (cooldown ate ${new Date(health.cfCooldownUntil).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})`
            : '';
          const rt = getRuntimeState ? getRuntimeState() : {};
          const lines = [
            '*Saude do Bot*',
            '',
            `Cloudflare: ${cfLabel}${cfExtra}`,
            `API sucesso: ${health.apiSuccessRate !== null ? health.apiSuccessRate + '%' : 'N/A'}`,
            `Tempo medio: ${health.avgResponseTime !== null ? health.avgResponseTime + 'ms' : 'N/A'}`,
            `Poll: tick ${process.env.POLL_TICK_MS || 5000}ms | grupos: ${rt.allGroups ? rt.allGroups.length : '?'}`,
            `Memoria: ${formatBytes(mem.heapUsed)}`,
            `DB: ${formatBytes(dbSize)}`,
            `Ultimo erro: ${health.lastError || 'nenhum'}${health.lastErrorTime ? ' (' + health.lastErrorTime + ')' : ''}`,
            `Uptime: ${health.uptime}`,
          ];
          await sendMessage(chatId, lines.join('\n'));
          break;
        }

        case '/atividade': {
          if (!isAdmin(chatId)) {
            await sendMessage(chatId, 'Acesso negado. Comando restrito ao admin.');
            break;
          }
          const searches = metrics.getRecentSearches(20);
          if (searches.length === 0) {
            await sendMessage(chatId, 'Nenhuma busca registrada ainda.');
          } else {
            const lines = ['*Atividade recente:*', ''];
            searches.forEach((s, i) => {
              const errLabel = s.error ? ` [ERRO: ${s.error}]` : '';
              lines.push(
                `${i + 1}. "${s.keyword}" [${s.platform}] -> ${s.resultCount} res, ${s.newCount} novo(s)${errLabel}`,
              );
              lines.push(`   ${s.timestamp}`);
            });
            await sendMessage(chatId, lines.join('\n'));
          }
          break;
        }

        case '/config': {
          if (!isAdmin(chatId)) {
            await sendMessage(chatId, 'Acesso negado. Comando restrito ao admin.');
            break;
          }
          const proxyStatus = process.env.PROXY_URL ? 'Configurado' : 'Desativado';
          const cfSettings = [
            `CF Cooldown: ${process.env.CF_COOLDOWN_MS || 300000}ms`,
            `CF Max: ${process.env.CF_MAX_COOLDOWN_MS || 3600000}ms`,
            `CF Alerta: ${process.env.CF_ALERT_THROTTLE_MS || 600000}ms`,
          ];
          const lines = [
            '*Configuracao do Bot*',
            '',
            `Poll tick: ${process.env.POLL_TICK_MS || 5000}ms`,
            `Concorrencia: ${process.env.MAX_CONCURRENT_SEARCHES || 5}`,
            `Jitter: ${process.env.REQUEST_JITTER_MS || 2000}ms`,
            `Cache TTL: ${process.env.CACHE_TTL_MS || 30000}ms`,
            `Browser ID rotacao: ${process.env.BROWSER_ID_ROTATE_MS || 1800000}ms`,
            `CURL: ${process.env.CURL_BIN || 'curl'}`,
            `Proxy: ${proxyStatus}`,
            `Filtro IA: ${process.env.ENABLE_RELEVANCE_FILTER || 'false'}`,
            `Cidade: ${process.env.ENJOEI_CITY || 'sao-jose-dos-pinhais'}`,
            `Estado: ${process.env.ENJOEI_STATE || 'pr'}`,
            '',
            ...cfSettings,
          ];
          await sendMessage(chatId, lines.join('\n'));
          break;
        }

        case '/grupos': {
          if (!isAdmin(chatId)) {
            await sendMessage(chatId, 'Acesso negado. Comando restrito ao admin.');
            break;
          }
          const rt2 = getRuntimeState ? getRuntimeState() : {};
          const groups = rt2.allGroups || [];
          const emptyCounts = rt2.groupEmptyCounts || new Map();
          if (groups.length === 0) {
            await sendMessage(chatId, 'Nenhum grupo ativo.');
          } else {
            const lines = [`*Grupos (${groups.length}):*`, ''];
            groups.forEach((g, i) => {
              const gKey = `${g.platform}||${g.keyword}||${g.filters ? JSON.stringify(g.filters) : ''}`;
              const stale = emptyCounts.get(gKey) || 0;
              const staleLabel = stale > 0 ? ` [stale: ${stale}]` : '';
              lines.push(`${i + 1}. "${g.keyword}" [${g.platform}] - ${g.users.length} user(s)${staleLabel}`);
            });
            await sendMessage(chatId, lines.join('\n'));
          }
          break;
        }

        case '/resetar': {
          if (!isAdmin(chatId)) {
            await sendMessage(chatId, 'Acesso negado. Comando restrito ao admin.');
            break;
          }
          enjoeiApi.resetCloudflareCooldown();
          await sendMessage(chatId, 'Cloudflare cooldown resetado. Proximas buscas serao tentadas normalmente.');
          break;
        }

        default:
          await sendMessage(chatId, `Comando desconhecido. Envie /ajuda para ver os comandos disponiveis.`);
          break;
      }
    } catch (err) {
      console.error(`[commands] Erro no comando ${command}:`, err.message);
      await sendMessage(chatId, 'Ocorreu um erro ao processar o comando.');
    }
  });

  // Callback query handler for inline keyboard buttons
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    const messageId = query.message.message_id;
    const data = query.data;

    if (!isAllowedChat(chatId)) {
      await bot.answerCallbackQuery(query.id, { text: 'Acesso negado.' });
      return;
    }

    if (!checkRateLimit(chatId)) {
      await bot.answerCallbackQuery(query.id, { text: 'Muitas requisicoes. Aguarde alguns segundos.' });
      return;
    }

    try {
      // Keyword selector: fs:<id>
      if (data.startsWith('fs:')) {
        const kwId = parseInt(data.split(':')[1], 10);
        const keywordRow = db.getKeywordByIdAndChat(kwId, chatId);
        if (!keywordRow) {
          await bot.answerCallbackQuery(query.id, { text: 'Palavra-chave nao encontrada.' });
          return;
        }
        const keyboard = buildFilterKeyboard(keywordRow);
        const platformModule = getPlatform(keywordRow.platform || DEFAULT_PLATFORM);
        const platformLabel = platformModule ? platformModule.platformName : keywordRow.platform;
        await bot.editMessageText(`\u2699\uFE0F Filtros para "${keywordRow.keyword}" (${platformLabel}):`, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: keyboard,
        });
        await bot.answerCallbackQuery(query.id);
        return;
      }

      // Filter toggle: f:<id>:<type>:<value>
      if (data.startsWith('f:')) {
        const dataParts = data.split(':');
        const kwId = parseInt(dataParts[1], 10);
        const filterType = dataParts[2];
        const filterValue = dataParts[3];

        const keywordRow = db.getKeywordByIdAndChat(kwId, chatId);
        if (!keywordRow) {
          await bot.answerCallbackQuery(query.id, { text: 'Palavra-chave nao encontrada.' });
          return;
        }

        const platform = keywordRow.platform || DEFAULT_PLATFORM;
        const platformModule = getPlatform(platform);

        if (filterType === 'clr') {
          // Clear all filters
          db.updateFilters(kwId, null);
        } else if (platformModule && platformModule.applyFilterToggle) {
          const filters = parseFilters(keywordRow.filters);
          const updated = platformModule.applyFilterToggle(filters, filterType, filterValue);
          const json = Object.keys(updated).length > 0 ? JSON.stringify(updated) : null;
          db.updateFilters(kwId, json);
        }

        // Refresh the keyboard
        const updated = db.getKeywordByIdAndChat(kwId, chatId);
        const keyboard = buildFilterKeyboard(updated);
        await bot.editMessageReplyMarkup(keyboard, {
          chat_id: chatId,
          message_id: messageId,
        });
        await bot.answerCallbackQuery(query.id);
      }
    } catch (err) {
      console.error('[commands] Erro no callback_query:', err.message);
      await bot.answerCallbackQuery(query.id, { text: 'Erro ao atualizar filtro.' });
    }
  });
}

module.exports = {
  register,
  setCheckCallback,
  setStatusData,
  setRuntimeStateGetter,
  formatFiltersSummary,
  buildFilterKeyboard,
  resetRateLimits: () => rateLimitMap.clear(),
};
