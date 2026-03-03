const { sendMessage, sendPhoto, escapeMd } = require('./telegram');
const { getPlatform, DEFAULT_PLATFORM } = require('./platforms');

function formatProduct(product, keyword, platform) {
  const platformModule = getPlatform(platform || DEFAULT_PLATFORM);
  const platformLabel = platformModule ? platformModule.platformName : (platform || 'Enjoei');
  const lines = [
    `\u{1F6A8} *Novo item no ${escapeMd(platformLabel)}!*`,
    '',
  ];
  if (product.seller) {
    lines.push(`*Vendedor:* ${escapeMd(product.seller)}`);
  }
  lines.push(
    `*Preco:* ${escapeMd(product.price || 'N/A')}`,
    `*Link:* ${escapeMd(product.url)}`,
    '',
    `Palavra-chave: "${escapeMd(keyword)}"`,
  );
  return lines.join('\n');
}

async function notifyNewProducts(products, keyword, chatId, platform) {
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const caption = formatProduct(product, keyword, platform);
    const extra = {};
    if (product.seller) {
      let sellerData = product.seller.toLowerCase();
      // Telegram callback_data limit is 64 bytes; "bs:" prefix uses 3
      while (Buffer.byteLength(`bs:${sellerData}`, 'utf8') > 64) {
        sellerData = sellerData.slice(0, -1);
      }
      extra.reply_markup = {
        inline_keyboard: [
          [{ text: '\u{1F6AB} Bloquear vendedor', callback_data: `bs:${sellerData}` }],
        ],
      };
    }
    if (product.image) {
      await sendPhoto(chatId, product.image, caption, extra);
    } else {
      await sendMessage(chatId, caption, extra);
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

module.exports = { notifyNewProducts, formatProduct };
