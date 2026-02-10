const TelegramBot = require('node-telegram-bot-api');

let bot;

function init(token) {
  bot = new TelegramBot(token, { polling: true });
  console.log('[telegram] Bot iniciado');
  return bot;
}

async function sendMessage(chatId, text) {
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[telegram] Erro ao enviar mensagem:', err.message);
  }
}

function getBot() {
  return bot;
}

module.exports = { init, sendMessage, getBot };
