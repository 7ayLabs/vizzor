import { Bot } from 'grammy';
import { loadConfig } from '../config/loader.js';
import { registerCommands } from './commands/index.js';
import { rateLimitMiddleware, startRateLimitCleanup } from './middleware/rate-limit.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('telegram-bot');

export async function startTelegramBot(): Promise<void> {
  const config = loadConfig();
  const token = config.telegramToken;

  if (!token) {
    throw new Error('Telegram token not configured. Run: vizzor config set telegramToken <token>');
  }

  const bot = new Bot(token);

  // Register rate-limiting middleware
  bot.use(rateLimitMiddleware);

  // Register slash commands
  registerCommands(bot);

  // AI chat handler for freetext messages
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;

    // Skip if it's a command (handled above)
    if (text.startsWith('/')) return;

    await ctx.reply(
      '🤖 AI chat is available in the CLI\\. Run `vizzor` to start an interactive session\\.\n\n' +
        '_Use /help to see available bot commands\\._',
      { parse_mode: 'MarkdownV2' },
    );
  });

  bot.catch((err) => {
    logger.error({ err: err.message }, 'Telegram bot error');
  });

  // Start periodic cleanup of rate limit entries
  const cleanupInterval = startRateLimitCleanup();

  logger.info('Telegram bot starting...');
  await bot.start({
    onStart: (botInfo) => {
      logger.info(`Telegram bot started as @${botInfo.username}`);
    },
  });

  // Cleanup on stop (unreachable in normal flow but good practice)
  clearInterval(cleanupInterval);
}
