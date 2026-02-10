const { sendMessage } = require('./telegram');

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

async function notifyNewProducts(products, keyword, chatId) {
  for (const product of products) {
    const message = formatProduct(product, keyword);
    await sendMessage(chatId, message);
    await new Promise(r => setTimeout(r, 500));
  }
}

module.exports = { notifyNewProducts, formatProduct };
