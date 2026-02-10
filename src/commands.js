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
            let msg = `Palavra-chave adicionada: "${keyword.toLowerCase()}"`;
            if (maxPrice) msg += ` (max R$ ${maxPrice.toFixed(2).replace('.', ',')})`;
            await sendMessage(chatId, msg);
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
              return line;
            }).join('\n');
            await sendMessage(chatId, `*Suas palavras-chave:*\n\n${list}`);
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
}

module.exports = { register, setCheckCallback, setStatusData, parsePrice };
