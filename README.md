# Enjoei Bot

Telegram bot that monitors [enjoei.com.br](https://www.enjoei.com.br) for new product listings matching your keywords and sends alerts with photo, price, and link.

## Setup

```bash
git clone https://github.com/gilmarTelles/enjoei-bot.git
cd enjoei-bot
npm install
```

Create a `.env` file:

```
TELEGRAM_BOT_TOKEN=your_token_here
CHECK_INTERVAL=5
```

Get your bot token from [@BotFather](https://t.me/BotFather) on Telegram.

```bash
node src/index.js
```

## Commands

| Command | Description |
|---------|-------------|
| `/adicionar <palavra>` | Add a keyword to monitor |
| `/remover <palavra>` | Remove a keyword |
| `/listar` | List your keywords |
| `/buscar` | Search now |
| `/ajuda` | Show help |

## Tests

```bash
npm test
```

## Deploy (PM2)

```bash
npm install -g pm2
pm2 start src/index.js --name enjoei-bot
pm2 save && pm2 startup
```
