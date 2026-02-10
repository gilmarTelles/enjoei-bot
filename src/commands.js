const db = require('./db');
const { sendMessage } = require('./telegram');

let checkCallback = null;

function setCheckCallback(cb) {
  checkCallback = cb;
}

function register(bot) {
  bot.onText(/\/entrar/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const added = db.addSubscriber(chatId);
    if (added) {
      await sendMessage(chatId, 'Voce foi inscrito! Vai receber alertas de novos itens no Enjoei.');
    } else {
      await sendMessage(chatId, 'Voce ja esta inscrito.');
    }
  });

  bot.onText(/\/sair/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const removed = db.removeSubscriber(chatId);
    if (removed) {
      await sendMessage(chatId, 'Voce foi removido. Nao vai mais receber alertas.');
    } else {
      await sendMessage(chatId, 'Voce nao esta inscrito.');
    }
  });

  bot.onText(/\/listar/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const keywords = db.listKeywords();
    if (keywords.length === 0) {
      await sendMessage(chatId, 'Nenhuma palavra-chave configurada.');
    } else {
      const list = keywords.map((k, i) => `${i + 1}. ${k}`).join('\n');
      await sendMessage(chatId, `*Palavras-chave monitoradas:*\n\n${list}`);
    }
  });

  bot.onText(/\/buscar/, async (msg) => {
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
    const chatId = msg.chat.id.toString();
    await sendMessage(chatId, [
      '*Bot Enjoei - Comandos*',
      '',
      '/entrar — Receber alertas de novos itens',
      '/sair — Parar de receber alertas',
      '/listar — Ver palavras-chave monitoradas',
      '/buscar — Buscar agora',
      '/ajuda — Mostrar esta mensagem',
    ].join('\n'));
  });
}

module.exports = { register, setCheckCallback };
