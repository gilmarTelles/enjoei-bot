const { sendMessage, sendPhoto, escapeMd } = require('./telegram');
const { getPlatform, DEFAULT_PLATFORM } = require('./platforms');

function formatProduct(product, keyword, platform) {
  const price = product.price || 'N/A';
  const title = product.title || '';
  const lines = [
    `\u{1F4B0} ${escapeMd(price)}${title ? ' | ' + escapeMd(title) : ''}`,
    `\u{1F50D} "${escapeMd(keyword)}"`,
    escapeMd(product.url),
  ];
  return lines.join('\n');
}

async function notifyNewProducts(products, keyword, chatId, platform) {
  const notified = [];
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const caption = formatProduct(product, keyword, platform);
    let success;
    if (product.image) {
      success = await sendPhoto(chatId, product.image, caption);
    } else {
      success = await sendMessage(chatId, caption);
    }
    if (success) notified.push(product);
    await new Promise((r) => setTimeout(r, 500));
  }
  return notified;
}

module.exports = { notifyNewProducts, formatProduct };
