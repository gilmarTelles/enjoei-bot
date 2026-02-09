const twilio = require('twilio');

let client;
let fromNumber;

function init() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER) {
    throw new Error('Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_WHATSAPP_NUMBER in .env');
  }

  client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  fromNumber = TWILIO_WHATSAPP_NUMBER.startsWith('whatsapp:')
    ? TWILIO_WHATSAPP_NUMBER
    : `whatsapp:${TWILIO_WHATSAPP_NUMBER}`;

  console.log('[twilio] Client initialized');
}

async function sendMessage(toNumber, text) {
  const to = toNumber.startsWith('whatsapp:') ? toNumber : `whatsapp:${toNumber}`;
  try {
    await client.messages.create({
      body: text,
      from: fromNumber,
      to: to,
    });
  } catch (err) {
    console.error('[twilio] Failed to send message:', err.message);
  }
}

function getClient() {
  return client;
}

module.exports = { init, sendMessage, getClient };
