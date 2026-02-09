const db = require('./db');
const { sendMessage } = require('./whatsapp');

let checkCallback = null;

function setCheckCallback(cb) {
  checkCallback = cb;
}

function register(client, ownerNumber) {
  // ownerNumber should be like "5511999999999"
  const ownerId = `${ownerNumber}@c.us`;

  client.on('message', async (msg) => {
    // Only respond to messages from the owner's personal chat
    if (msg.from !== ownerId) return;

    const body = msg.body.trim();
    if (!body) return;

    const [command, ...args] = body.split(/\s+/);
    const keyword = args.join(' ');

    switch (command.toLowerCase()) {
      case 'add': {
        if (!keyword) {
          await sendMessage(ownerId, 'Usage: add <keyword>\nExample: add nike air max');
          return;
        }
        const added = db.addKeyword(keyword);
        if (added) {
          await sendMessage(ownerId, `Added keyword: "${keyword.toLowerCase()}"`);
        } else {
          await sendMessage(ownerId, `Keyword "${keyword.toLowerCase()}" already exists.`);
        }
        break;
      }

      case 'remove': {
        if (!keyword) {
          await sendMessage(ownerId, 'Usage: remove <keyword>\nExample: remove nike air max');
          return;
        }
        const removed = db.removeKeyword(keyword);
        if (removed) {
          await sendMessage(ownerId, `Removed keyword: "${keyword.toLowerCase()}"`);
        } else {
          await sendMessage(ownerId, `Keyword "${keyword.toLowerCase()}" not found.`);
        }
        break;
      }

      case 'list': {
        const keywords = db.listKeywords();
        if (keywords.length === 0) {
          await sendMessage(ownerId, 'No keywords configured. Use "add <keyword>" to start.');
        } else {
          const list = keywords.map((k, i) => `${i + 1}. ${k}`).join('\n');
          await sendMessage(ownerId, `*Active keywords:*\n\n${list}`);
        }
        break;
      }

      case 'check': {
        await sendMessage(ownerId, 'Running manual check...');
        if (checkCallback) {
          try {
            await checkCallback();
            await sendMessage(ownerId, 'Check completed.');
          } catch (err) {
            await sendMessage(ownerId, `Check failed: ${err.message}`);
          }
        } else {
          await sendMessage(ownerId, 'Check function not configured yet.');
        }
        break;
      }

      case 'help': {
        await sendMessage(ownerId, [
          '*Enjoei Alert Bot - Commands*',
          '',
          'add <keyword> — Add a keyword to watch',
          'remove <keyword> — Remove a keyword',
          'list — Show all active keywords',
          'check — Run an immediate search',
          'help — Show this message',
        ].join('\n'));
        break;
      }

      default:
        // Ignore unrecognized messages
        break;
    }
  });
}

module.exports = { register, setCheckCallback };
