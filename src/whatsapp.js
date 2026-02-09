const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, '..', '.wwebjs_auth'),
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  },
});

function start() {
  return new Promise((resolve, reject) => {
    client.on('qr', (qr) => {
      console.log('[whatsapp] Scan the QR code below to log in:');
      qrcode.generate(qr, { small: true });
    });

    client.on('authenticated', () => {
      console.log('[whatsapp] Authenticated');
    });

    client.on('auth_failure', (msg) => {
      console.error('[whatsapp] Auth failure:', msg);
      reject(new Error(`Auth failure: ${msg}`));
    });

    client.on('ready', () => {
      console.log('[whatsapp] Client is ready');
      resolve();
    });

    client.on('disconnected', (reason) => {
      console.warn('[whatsapp] Disconnected:', reason);
    });

    client.initialize();
  });
}

async function sendMessage(chatId, text) {
  try {
    await client.sendMessage(chatId, text);
  } catch (err) {
    console.error('[whatsapp] Failed to send message:', err.message);
  }
}

function getClient() {
  return client;
}

module.exports = { start, sendMessage, getClient };
