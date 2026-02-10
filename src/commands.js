const db = require('./db');
const { sendMessage } = require('./telegram');

const ALLOWED_USERS = ['6397962194', '7653440251'];

function isAllowed(msg) {
  return ALLOWED_USERS.includes(msg.chat.id.toString());
}

let checkCallback = null;

function setCheckCallback(cb) {
  checkCallback = cb;
}

const KNOWN_COMMANDS = ['/adicionar', '/remover', '/listar', '/buscar', '/ajuda', '/start', '/help'];

function register(bot) {
  bot.on('message', async (msg) => {
    if (!msg.text || !msg.text.startsWith('/')) return;

    if (!isAllowed(msg)) {
      await sendMessage(msg.chat.id.toString(), 'Acesso negado.');
      return;
    }

    const command = msg.text.split(/\s+/)[0].toLowerCase();
    if (!KNOWN_COMMANDS.includes(command)) {
      await sendMessage(msg.chat.id.toString(), `Comando desconhecido: ${command}\nEnvie /ajuda para ver os comandos disponiveis.`);
    }
  });

  bot.onText(/\/adicionar$/, async (msg) => {
    if (!isAllowed(msg)) return;
    await sendMessage(msg.chat.id.toString(), 'Uso: /adicionar <palavra>\nExemplo: /adicionar nike air max');
  });

  bot.onText(/\/adicionar (.+)/, async (msg, match) => {
    if (!isAllowed(msg)) return;
    const chatId = msg.chat.id.toString();
    const keyword = match[1].trim();
    const added = db.addKeyword(chatId, keyword);
    if (added) {
      await sendMessage(chatId, `Palavra-chave adicionada: "${keyword.toLowerCase()}"`);
    } else {
      await sendMessage(chatId, `Palavra-chave "${keyword.toLowerCase()}" ja existe.`);
    }
  });

  bot.onText(/\/remover$/, async (msg) => {
    if (!isAllowed(msg)) return;
    await sendMessage(msg.chat.id.toString(), 'Uso: /remover <palavra>\nExemplo: /remover nike air max');
  });

  bot.onText(/\/remover (.+)/, async (msg, match) => {
    if (!isAllowed(msg)) return;
    const chatId = msg.chat.id.toString();
    const keyword = match[1].trim();
    const removed = db.removeKeyword(chatId, keyword);
    if (removed) {
      await sendMessage(chatId, `Palavra-chave removida: "${keyword.toLowerCase()}"`);
    } else {
      await sendMessage(chatId, `Palavra-chave "${keyword.toLowerCase()}" nao encontrada.`);
    }
  });

  bot.onText(/\/listar/, async (msg) => {
    if (!isAllowed(msg)) return;
    const chatId = msg.chat.id.toString();
    const keywords = db.listKeywords(chatId);
    if (keywords.length === 0) {
      await sendMessage(chatId, 'Nenhuma palavra-chave configurada. Use /adicionar <palavra> para comecar.');
    } else {
      const list = keywords.map((k, i) => `${i + 1}. ${k}`).join('\n');
      await sendMessage(chatId, `*Suas palavras-chave:*\n\n${list}`);
    }
  });

  bot.onText(/\/buscar/, async (msg) => {
    if (!isAllowed(msg)) return;
    const chatId = msg.chat.id.toString();
    await sendMessage(chatId, 'Buscando agora...');
    if (checkCallback) {
      try {
        await checkCallback();
        await sendMessage(chatId, 'Busca concluida.');
      } catch (err) {
        await sendMessage(chatId, `Erro na busca: ${err.message}`);
      }
    }
  });

  bot.onText(/\/ajuda|\/start|\/help/, async (msg) => {
    if (!isAllowed(msg)) return;
    const chatId = msg.chat.id.toString();
    await sendMessage(chatId, [
      '*Bot Enjoei - Comandos*',
      '',
      '/adicionar <palavra> — Adicionar palavra-chave',
      '/remover <palavra> — Remover palavra-chave',
      '/listar — Ver suas palavras-chave',
      '/buscar — Buscar agora',
      '/ajuda — Mostrar esta mensagem',
    ].join('\n'));
  });
}

module.exports = { register, setCheckCallback };
