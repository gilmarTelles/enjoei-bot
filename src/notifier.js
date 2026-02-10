const { sendMessage, sendPhoto } = require('./telegram');

function formatProduct(product, keyword) {
  const lines = [
    '\u{1F6A8} *Novo item no Enjoei!*',
    '',
    `*Preco:* ${product.price || 'N/A'}`,
    `*Link:* ${product.url}`,
    '',
    `Palavra-chave: "${keyword}"`,
  ];
  return lines.join('\n');
}

function formatPriceDrop(product, keyword, oldPrice, newPrice) {
  const lines = [
    '\u{1F4B8} *Queda de preco!*',
    '',
    `*De:* ${oldPrice}`,
    `*Para:* ${newPrice}`,
    `*Link:* ${product.url}`,
    '',
    `Palavra-chave: "${keyword}"`,
  ];
  return lines.join('\n');
}

async function notifyNewProducts(products, keyword, chatId) {
  for (const product of products) {
    const caption = formatProduct(product, keyword);
    if (product.image) {
      await sendPhoto(chatId, product.image, caption);
    } else {
      await sendMessage(chatId, caption);
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

async function notifyPriceDrop(product, keyword, chatId, oldPrice, newPrice) {
  const caption = formatPriceDrop(product, keyword, oldPrice, newPrice);
  if (product.image) {
    await sendPhoto(chatId, product.image, caption);
  } else {
    await sendMessage(chatId, caption);
  }
}

module.exports = { notifyNewProducts, notifyPriceDrop, formatProduct, formatPriceDrop };
