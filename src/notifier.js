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

function formatPriceDrop(product, keyword, oldPrice, newPrice, platform) {
  const platformModule = getPlatform(platform || DEFAULT_PLATFORM);
  const platformLabel = platformModule ? platformModule.platformName : (platform || 'Enjoei');
  const lines = [
    `\u{1F4B8} *Queda de preco no ${platformLabel}!*`,
    '',
    `*De:* ${oldPrice}`,
    `*Para:* ${newPrice}`,
    `*Link:* ${product.url}`,
    '',
    `Palavra-chave: "${keyword}"`,
  ];
  return lines.join('\n');
}

async function notifyNewProducts(products, keyword, chatId, platform, seenIds) {
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const caption = formatProduct(product, keyword, platform);
    const extra = {};
    if (seenIds && seenIds[i] != null) {
      extra.reply_markup = {
        inline_keyboard: [[
          { text: '\uD83D\uDC41 Monitorar preco', callback_data: `wp:${seenIds[i]}` }
        ]]
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

async function notifyPriceDrop(product, keyword, chatId, oldPrice, newPrice, platform, watchedId) {
  const caption = formatPriceDrop(product, keyword, oldPrice, newPrice, platform);
  const extra = {};
  if (watchedId != null) {
    extra.reply_markup = {
      inline_keyboard: [[
        { text: '\u274C Parar de monitorar', callback_data: `uw:${watchedId}` }
      ]]
    };
  }
  if (product.image) {
    await sendPhoto(chatId, product.image, caption, extra);
  } else {
    await sendMessage(chatId, caption, extra);
  }
}

module.exports = { notifyNewProducts, notifyPriceDrop, formatProduct, formatPriceDrop };
