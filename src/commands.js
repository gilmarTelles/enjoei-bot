const db = require('./db');
const { sendMessage } = require('./telegram');

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

function formatFiltersSummary(filters) {
  if (!filters || Object.keys(filters).length === 0) return '';
  const parts = [];
  if (filters.used) parts.push('usado');
  if (filters.dep) parts.push(filters.dep);
  if (filters.sz) parts.push(`tam: ${filters.sz.toUpperCase()}`);
  if (filters.sr) parts.push('mesmo pais');
  if (filters.sort === 'price_asc') parts.push('menor preco');
  if (filters.sort === 'price_desc') parts.push('maior preco');
  return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
}

function buildFilterKeyboard(keywordRow) {
  const filters = parseFilters(keywordRow.filters);
  const id = keywordRow.id;

  const usedLabel = filters.used ? '\u2705 Somente usados' : '\u274C Somente usados';
  const depMLabel = filters.dep === 'masculino' ? '\u2705 Masculino' : '\u2B1C Masculino';
  const depFLabel = filters.dep === 'feminino' ? '\u2705 Feminino' : '\u2B1C Feminino';
  const srLabel = filters.sr ? '\u2705 Mesmo pais' : '\u274C Mesmo pais';
  const sortALabel = filters.sort === 'price_asc' ? '\u2705 Menor preco' : '\u2B1C Menor preco';
  const sortDLabel = filters.sort === 'price_desc' ? '\u2705 Maior preco' : '\u2B1C Maior preco';

  const szLabels = { pp: 'PP', p: 'P', m: 'M', g: 'G', gg: 'GG' };
  const szRow = Object.entries(szLabels).map(([key, label]) => ({
    text: filters.sz === key ? `\u2705 ${label}` : `\u2B1C ${label}`,
    callback_data: `f:${id}:sz:${key}`,
  }));

  return {
    inline_keyboard: [
      [{ text: usedLabel, callback_data: `f:${id}:used:t` }],
      [
        { text: depMLabel, callback_data: `f:${id}:dep:m` },
        { text: depFLabel, callback_data: `f:${id}:dep:f` },
      ],
      szRow,
      [{ text: srLabel, callback_data: `f:${id}:sr:t` }],
      [
        { text: sortALabel, callback_data: `f:${id}:sort:a` },
        { text: sortDLabel, callback_data: `f:${id}:sort:d` },
      ],
      [{ text: '\uD83D\uDDD1 Limpar filtros', callback_data: `f:${id}:clr:0` }],
    ],
  };
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
  const buttons = keywords.map(k => ([{
    text: k.keyword,
    callback_data: `fs:${k.id}`,
  }]));
  await bot.sendMessage(chatId, 'Escolha a palavra-chave:', {
    reply_markup: { inline_keyboard: buttons },
  });
}

async function showFilterKeyboard(bot, chatId, keywordRow) {
  const keyboard = buildFilterKeyboard(keywordRow);
  await bot.sendMessage(chatId, `\u2699\uFE0F Filtros para "${keywordRow.keyword}":`, {
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

          // Parse optional price filter: "nike air max < 200"
          let keyword = arg;
          let maxPrice = null;
          const priceMatch = arg.match(/^(.+?)\s*<\s*(\d+(?:[.,]\d+)?)\s*$/);
          if (priceMatch) {
            keyword = priceMatch[1].trim();
            maxPrice = parseFloat(priceMatch[2].replace(',', '.'));
          }

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
          const added = db.addKeyword(chatId, keyword, maxPrice);
          if (added) {
            let confirmMsg = `Palavra-chave adicionada: "${keyword.toLowerCase()}"`;
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
          const removed = db.removeKeyword(chatId, arg);
          if (removed) {
            await sendMessage(chatId, `Palavra-chave removida: "${arg.toLowerCase()}"`);
          } else {
            await sendMessage(chatId, `Palavra-chave "${arg.toLowerCase()}" nao encontrada.`);
          }
          break;
        }

        case '/listar': {
          const keywords = db.listKeywords(chatId);
          if (keywords.length === 0) {
            await sendMessage(chatId, 'Nenhuma palavra-chave configurada. Use /adicionar <palavra> para comecar.');
          } else {
            const list = keywords.map((k, i) => {
              let line = `${i + 1}. ${k.keyword}`;
              if (k.max_price) line += ` (max R$ ${k.max_price.toFixed(2).replace('.', ',')})`;
              const filtersSummary = formatFiltersSummary(parseFilters(k.filters));
              if (filtersSummary) line += filtersSummary;
              return line;
            }).join('\n');
            await sendMessage(chatId, `*Suas palavras-chave:*\n\n${list}`);
          }
          break;
        }

        case '/filtros': {
          if (arg) {
            // Find keyword by name
            const keywords = db.listKeywordsWithId(chatId);
            const match = keywords.find(k => k.keyword === arg.toLowerCase().trim());
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
            await checkCallback();
            await sendMessage(chatId, 'Busca concluida.');
          }
          break;
        }

        case '/status': {
          if (!statusData) {
            await sendMessage(chatId, 'Nenhuma verificacao realizada ainda.');
          } else {
            const lines = [
              '*Status do Bot*',
              '',
              `Ultima verificacao: ${statusData.lastCheckTime}`,
              `Palavras-chave verificadas: ${statusData.keywordsChecked}`,
              `Novos produtos encontrados: ${statusData.newProductsFound}`,
              `Quedas de preco detectadas: ${statusData.priceDrops}`,
            ];
            await sendMessage(chatId, lines.join('\n'));
          }
          break;
        }

        case '/ajuda':
        case '/start':
        case '/help': {
          await sendMessage(chatId, [
            '*Bot Enjoei - Comandos*',
            '',
            '/adicionar <palavra> — Adicionar palavra-chave',
            '/adicionar <palavra> < preco — Com filtro de preco',
            '/remover <palavra> — Remover palavra-chave',
            '/listar — Ver suas palavras-chave',
            '/filtros — Configurar filtros de busca',
            '/buscar — Buscar agora',
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
        await bot.editMessageText(`\u2699\uFE0F Filtros para "${keywordRow.keyword}":`, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: keyboard,
        });
        await bot.answerCallbackQuery(query.id);
        return;
      }

      // Filter toggle: f:<id>:<type>:<value>
      if (data.startsWith('f:')) {
        const parts = data.split(':');
        const kwId = parseInt(parts[1], 10);
        const filterType = parts[2];
        const filterValue = parts[3];

        const keywordRow = db.getKeywordByIdAndChat(kwId, chatId);
        if (!keywordRow) {
          await bot.answerCallbackQuery(query.id, { text: 'Palavra-chave nao encontrada.' });
          return;
        }

        const filters = parseFilters(keywordRow.filters);

        if (filterType === 'clr') {
          // Clear all filters
          db.updateFilters(kwId, null);
        } else {
          switch (filterType) {
            case 'used':
              filters.used = !filters.used;
              if (!filters.used) delete filters.used;
              break;
            case 'dep': {
              const depMap = { m: 'masculino', f: 'feminino' };
              const newDep = depMap[filterValue];
              filters.dep = filters.dep === newDep ? undefined : newDep;
              if (!filters.dep) delete filters.dep;
              break;
            }
            case 'sz':
              filters.sz = filters.sz === filterValue ? undefined : filterValue;
              if (!filters.sz) delete filters.sz;
              break;
            case 'sr':
              filters.sr = !filters.sr;
              if (!filters.sr) delete filters.sr;
              break;
            case 'sort': {
              const sortMap = { a: 'price_asc', d: 'price_desc' };
              const newSort = sortMap[filterValue];
              filters.sort = filters.sort === newSort ? undefined : newSort;
              if (!filters.sort) delete filters.sort;
              break;
            }
          }
          const json = Object.keys(filters).length > 0 ? JSON.stringify(filters) : null;
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

module.exports = { register, setCheckCallback, setStatusData, parsePrice, parseFilters, formatFiltersSummary, buildFilterKeyboard };
