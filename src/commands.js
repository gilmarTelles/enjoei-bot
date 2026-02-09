const db = require('./db');
const { sendMessage } = require('./whatsapp');

let checkCallback = null;

function setCheckCallback(cb) {
  checkCallback = cb;
}

async function handleMessage(from, body) {
  const text = body.trim();
  if (!text) return;

  const [command, ...args] = text.split(/\s+/);
  const keyword = args.join(' ');

  switch (command.toLowerCase()) {
    case 'add': {
      if (!keyword) {
        await sendMessage(from, 'Usage: add <keyword>\nExample: add nike air max');
        return;
      }
      const added = db.addKeyword(keyword);
      if (added) {
        await sendMessage(from, `Added keyword: "${keyword.toLowerCase()}"`);
      } else {
        await sendMessage(from, `Keyword "${keyword.toLowerCase()}" already exists.`);
      }
      break;
    }

    case 'remove': {
      if (!keyword) {
        await sendMessage(from, 'Usage: remove <keyword>\nExample: remove nike air max');
        return;
      }
      const removed = db.removeKeyword(keyword);
      if (removed) {
        await sendMessage(from, `Removed keyword: "${keyword.toLowerCase()}"`);
      } else {
        await sendMessage(from, `Keyword "${keyword.toLowerCase()}" not found.`);
      }
      break;
    }

    case 'list': {
      const keywords = db.listKeywords();
      if (keywords.length === 0) {
        await sendMessage(from, 'No keywords configured. Use "add <keyword>" to start.');
      } else {
        const list = keywords.map((k, i) => `${i + 1}. ${k}`).join('\n');
        await sendMessage(from, `*Active keywords:*\n\n${list}`);
      }
      break;
    }

    case 'check': {
      await sendMessage(from, 'Running manual check...');
      if (checkCallback) {
        try {
          await checkCallback();
          await sendMessage(from, 'Check completed.');
        } catch (err) {
          await sendMessage(from, `Check failed: ${err.message}`);
        }
      } else {
        await sendMessage(from, 'Check function not configured yet.');
      }
      break;
    }

    case 'help': {
      await sendMessage(from, [
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
      break;
  }
}

module.exports = { handleMessage, setCheckCallback };
