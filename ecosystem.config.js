module.exports = {
  apps: [
    {
      name: 'enjoei-bot',
      script: 'src/index.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        // Required — set these or ensure .env is present on the server:
        // TELEGRAM_BOT_TOKEN: '',
        // ALLOWED_USERS: '',
        // Optional:
        // ADMIN_CHAT_ID: '',
        // ANTHROPIC_API_KEY: '',
        // ENABLE_RELEVANCE_FILTER: 'false',
        // POLL_INTERVAL_MS: '2000',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
    },
  ],
};
