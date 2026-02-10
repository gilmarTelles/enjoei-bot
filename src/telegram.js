const TelegramBot = require('node-telegram-bot-api');

let bot;

function init(token) {
  bot = new TelegramBot(token, { polling: true });
  console.log('[telegram] Bot iniciado');
  return bot;
}

async function sendMessage(chatId, text, extra = {}) {
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...extra });
  } catch (err) {
    console.error('[telegram] Erro ao enviar mensagem:', err.message);
  }
}

async function sendPhoto(chatId, imageUrl, caption, extra = {}) {
  try {
    await bot.sendPhoto(chatId, imageUrl, { caption, parse_mode: 'Markdown', ...extra });
  } catch (err) {
    console.error('[telegram] Erro ao enviar foto:', err.message);
    // Fallback to text message if photo fails
    await sendMessage(chatId, caption, extra);
  }
}

function getBot() {
  return bot;
}

module.exports = { init, sendMessage, sendPhoto, getBot };
