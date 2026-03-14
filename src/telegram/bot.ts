import { Bot } from 'grammy';
import { loadConfig } from '../config/loader.js';
import { setConfig, setToolHandler, analyze } from '../ai/client.js';
import { handleTool } from '../ai/tool-handler.js';
import { VIZZOR_TOOLS } from '../ai/tools.js';
import { buildChatSystemPrompt } from '../ai/prompts/chat.js';
import { splitMessage } from '../utils/message-split.js';
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

  // Initialize AI layer for tool-use chat
  setConfig(config);
  setToolHandler(handleTool);

  const bot = new Bot(token);

  // Register rate-limiting middleware
  bot.use(rateLimitMiddleware);

  // Register slash commands
  registerCommands(bot);

  // AI chat handler for freetext messages
  bot.on('message:text', async (ctx) => {
    let text = ctx.message.text;

    // Skip if it's a command (handled above)
    if (text.startsWith('/')) return;

    // Input length limit to prevent abuse
    if (text.length > 4000) {
      text = text.slice(0, 4000);
    }

    await ctx.reply('🔮 Analyzing...');

    try {
      const response = await analyze(buildChatSystemPrompt(), text, VIZZOR_TOOLS);
      const chunks = splitMessage(response, 4000);
      for (const chunk of chunks) {
        await ctx.reply(chunk);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await ctx.reply(`Analysis failed: ${msg}`);
    }
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
