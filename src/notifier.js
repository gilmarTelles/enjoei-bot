const { sendMessage, sendPhoto } = require('./telegram');
const { getPlatform, DEFAULT_PLATFORM } = require('./platforms');

function formatProduct(product, keyword, platform) {
  const platformModule = getPlatform(platform || DEFAULT_PLATFORM);
  const platformLabel = platformModule ? platformModule.platformName : (platform || 'Enjoei');
  const lines = [
    `\u{1F6A8} *Novo item no ${platformLabel}!*`,
    '',
    `*Preco:* ${product.price || 'N/A'}`,
    `*Link:* ${product.url}`,
    '',
    `Palavra-chave: "${keyword}"`,
  ];
  return lines.join('\n');
}

async function notifyNewProducts(products, keyword, chatId, platform) {
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const caption = formatProduct(product, keyword, platform);
    if (product.image) {
      await sendPhoto(chatId, product.image, caption);
    } else {
      await sendMessage(chatId, caption);
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

module.exports = { notifyNewProducts, formatProduct };
