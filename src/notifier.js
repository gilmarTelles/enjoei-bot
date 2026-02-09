const { sendMessage } = require('./whatsapp');

function formatProduct(product, keyword) {
  const lines = [
    '\u{1F514} *New on Enjoei!*',
    '',
    `*Title:* ${product.title || 'N/A'}`,
    `*Price:* ${product.price || 'N/A'}`,
    `*Link:* ${product.url}`,
    '',
    `Keyword: "${keyword}"`,
  ];
  return lines.join('\n');
}

async function notifyNewProducts(products, keyword, chatId) {
  for (const product of products) {
    const message = formatProduct(product, keyword);
    await sendMessage(chatId, message);
    // Small delay between messages to avoid rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }
}

module.exports = { notifyNewProducts, formatProduct };
