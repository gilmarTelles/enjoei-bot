const db = require('./db');
const { sendMessage } = require('./telegram');

const ALLOWED_USERS = ['6397962194', '7653440251'];
const MAX_KEYWORDS = 10;
const KEYWORD_MIN_LEN = 2;
const KEYWORD_MAX_LEN = 50;

function isAllowed(msg) {
  return ALLOWED_USERS.includes(msg.chat.id.toString());
}

let checkCallback = null;

function setCheckCallback(cb) {
  checkCallback = cb;
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
            await sendMessage(chatId, 'Uso: /adicionar <palavra>\nExemplo: /adicionar nike air max');
            return;
          }
          if (arg.length < KEYWORD_MIN_LEN) {
            await sendMessage(chatId, `Palavra-chave muito curta (minimo ${KEYWORD_MIN_LEN} caracteres).`);
            return;
          }
          if (arg.length > KEYWORD_MAX_LEN) {
            await sendMessage(chatId, `Palavra-chave muito longa (maximo ${KEYWORD_MAX_LEN} caracteres).`);
            return;
          }
          const count = db.countKeywords(chatId);
          if (count >= MAX_KEYWORDS) {
            await sendMessage(chatId, `Limite de ${MAX_KEYWORDS} palavras-chave atingido. Remova alguma com /remover.`);
            return;
          }
          const added = db.addKeyword(chatId, arg);
          if (added) {
            await sendMessage(chatId, `Palavra-chave adicionada: "${arg.toLowerCase()}"`);
          } else {
            await sendMessage(chatId, `Palavra-chave "${arg.toLowerCase()}" ja existe.`);
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
            const list = keywords.map((k, i) => `${i + 1}. ${k}`).join('\n');
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

        case '/ajuda':
        case '/start':
        case '/help': {
          await sendMessage(chatId, [
            '*Bot Enjoei - Comandos*',
            '',
            '/adicionar <palavra> — Adicionar palavra-chave',
            '/remover <palavra> — Remover palavra-chave',
            '/listar — Ver suas palavras-chave',
            '/buscar — Buscar agora',
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

module.exports = { register, setCheckCallback };
