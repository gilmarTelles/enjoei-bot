const db = require('./db');
const { sendMessage } = require('./telegram');
const { getPlatform, resolvePlatformAlias, DEFAULT_PLATFORM } = require('./platforms');

const MAX_KEYWORDS = 10;
const KEYWORD_MIN_LEN = 2;
const KEYWORD_MAX_LEN = 50;

function getAllowedUsers() {
  return (process.env.ALLOWED_USERS || '').split(',').map(s => s.trim()).filter(Boolean);
}

function isAllowed(msg) {
  return getAllowedUsers().includes(msg.chat.id.toString());
}

function isAllowedChat(chatId) {
  return getAllowedUsers().includes(chatId.toString());
}

let checkCallback = null;
let statusData = null;

function setCheckCallback(cb) {
  checkCallback = cb;
}

function setStatusData(data) {
  statusData = data;
}

function sanitizeKeyword(keyword) {
  return keyword
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '') // smart double quotes
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, '') // smart single quotes
    .replace(/[<>{}[\]|\\^~`]/g, '')                         // brackets and special chars
    .replace(/\s+/g, ' ')                                     // collapse whitespace
    .trim();
}

function parsePrice(priceStr) {
  if (!priceStr) return null;
  const cleaned = priceStr.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseFilters(filtersStr) {
  if (!filtersStr) return {};
  try {
    return JSON.parse(filtersStr);
  } catch {
    return {};
  }
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
  const buttons = keywords.map(k => {
    const platformModule = getPlatform(k.platform || DEFAULT_PLATFORM);
    const platformLabel = platformModule ? platformModule.platformName : k.platform;
    return [{
      text: `${k.keyword} (${platformLabel})`,
      callback_data: `fs:${k.id}`,
    }];
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

    const parts = text.split(/\s+/);
    const command = parts[0].toLowerCase().replace(/@.*$/, ''); // remove @botname
    const arg = parts.slice(1).join(' ').trim();

    try {
      switch (command) {
        case '/adicionar': {
          if (!arg) {
            await sendMessage(chatId, 'Uso: /adicionar <palavra> [< preco\\_max]\nExemplo: /adicionar nike air max\nExemplo: /adicionar nike < 200');
            return;
          }

          // First, parse platform from the full arg (platform is last word)
          const { keyword: argWithoutPlatform, platform } = parsePlatformFromArg(arg);

          // Then parse optional price filter: "nike air max < 200"
          let keyword = argWithoutPlatform;
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
          const count = db.countKeywords(chatId);
          if (count >= MAX_KEYWORDS) {
            await sendMessage(chatId, `Limite de ${MAX_KEYWORDS} palavras-chave atingido. Remova alguma com /remover.`);
            return;
          }
          const platformModule = getPlatform(platform);
          const platformLabel = platformModule ? platformModule.platformName : platform;
          const added = db.addKeyword(chatId, keyword, maxPrice, platform);
          if (added) {
            let confirmMsg = `Palavra-chave adicionada: "${keyword.toLowerCase()}" (${platformLabel})`;
            if (maxPrice) confirmMsg += ` (max R$ ${maxPrice.toFixed(2).replace('.', ',')})`;
            confirmMsg += '\nUse /filtros para configurar filtros de busca.';
            await sendMessage(chatId, confirmMsg);
          } else {
            await sendMessage(chatId, `Palavra-chave "${keyword.toLowerCase()}" ja existe no ${platformLabel}.`);
          }
          break;
        }

        case '/remover': {
          if (!arg) {
            await sendMessage(chatId, 'Uso: /remover <palavra>\nExemplo: /remover nike air max');
            return;
          }
          const { keyword: kw, platform: rmPlatform } = parsePlatformFromArg(arg);
          // If platform was explicitly given, remove from that platform only
          const platformGiven = rmPlatform !== DEFAULT_PLATFORM || resolvePlatformAlias(arg.trim().split(/\s+/).pop());
          const removed = platformGiven
            ? db.removeKeyword(chatId, kw, rmPlatform)
            : db.removeKeyword(chatId, arg);
          if (removed) {
            const label = platformGiven ? ` (${getPlatform(rmPlatform)?.platformName || rmPlatform})` : '';
            await sendMessage(chatId, `Palavra-chave removida: "${(platformGiven ? kw : arg).toLowerCase()}"${label}`);
          } else {
            await sendMessage(chatId, `Palavra-chave "${(platformGiven ? kw : arg).toLowerCase()}" nao encontrada.`);
          }
          break;
        }

        case '/listar': {
          const keywords = db.listKeywords(chatId);
          if (keywords.length === 0) {
            await sendMessage(chatId, 'Nenhuma palavra-chave configurada. Use /adicionar <palavra> para comecar.');
          } else {
            const list = keywords.map((k, i) => {
              const platformModule = getPlatform(k.platform || DEFAULT_PLATFORM);
              const platformLabel = platformModule ? platformModule.platformName : k.platform;
              let line = `${i + 1}. ${k.keyword} (${platformLabel})`;
              if (k.max_price) line += ` (max R$ ${k.max_price.toFixed(2).replace('.', ',')})`;
              const filtersSummary = formatFiltersSummary(parseFilters(k.filters), k.platform);
              if (filtersSummary) line += filtersSummary;
              return line;
            }).join('\n');
            await sendMessage(chatId, `*Suas palavras-chave:*\n\n${list}`);
          }
          break;
        }

        case '/filtros': {
          if (arg) {
            // Find keyword by name (optionally with platform)
            const { keyword: fkw, platform: fplatform } = parsePlatformFromArg(arg);
            const keywords = db.listKeywordsWithId(chatId);
            const platformGiven = fplatform !== DEFAULT_PLATFORM || resolvePlatformAlias(arg.trim().split(/\s+/).pop());
            let match;
            if (platformGiven) {
              match = keywords.find(k => k.keyword === fkw.toLowerCase().trim() && k.platform === fplatform);
            } else {
              match = keywords.find(k => k.keyword === arg.toLowerCase().trim());
            }
            if (!match) {
              await sendMessage(chatId, `Palavra-chave "${arg.toLowerCase()}" nao encontrada.`);
              return;
            }
            await showFilterKeyboard(bot, chatId, match);
          } else {
            await showKeywordSelector(bot, chatId);
          }
          break;
        }

        case '/buscar': {
          await sendMessage(chatId, 'Buscando agora...');
          if (checkCallback) {
            const summary = await checkCallback();
            if (summary) {
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
          await sendMessage(chatId, [
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
            '/ajuda — Mostrar esta mensagem',
          ].join('\n'));
          break;
        }

        default:
          await sendMessage(chatId, `Comando desconhecido: ${command}\nEnvie /ajuda para ver os comandos disponiveis.`);
          break;
      }
    } catch (err) {
      console.error(`[commands] Erro no comando ${command}:`, err.message);
      await sendMessage(chatId, `Erro ao executar comando: ${err.message}`);
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

module.exports = { register, setCheckCallback, setStatusData, parsePrice, parseFilters, formatFiltersSummary, buildFilterKeyboard, sanitizeKeyword };
