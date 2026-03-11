import chalk from 'chalk';
import { getConfig } from '../../config/loader.js';
import { requireKey } from '../../config/keys.js';

export async function handleBotStart(options: {
  discord: boolean;
  telegram: boolean;
  all: boolean;
}): Promise<void> {
  const config = getConfig();
  const startDiscord = options.discord || options.all;
  const startTelegram = options.telegram || options.all;

  if (!startDiscord && !startTelegram) {
    console.log(chalk.yellow('Specify which bot to start:'));
    console.log('  --discord   Start Discord bot');
    console.log('  --telegram  Start Telegram bot');
    console.log('  --all       Start all bots');
    return;
  }

  const promises: Promise<void>[] = [];

  if (startDiscord) {
    requireKey('DISCORD_TOKEN', config.discordToken);
    console.log(chalk.blue('Starting Discord bot...'));
    const { startDiscordBot } = await import('../../discord/bot.js');
    promises.push(startDiscordBot());
  }

  if (startTelegram) {
    requireKey('TELEGRAM_BOT_TOKEN', config.telegramToken);
    console.log(chalk.blue('Starting Telegram bot...'));
    const { startTelegramBot } = await import('../../telegram/bot.js');
    promises.push(startTelegramBot());
  }

  // Handle graceful shutdown
  const shutdown = () => {
    console.log(chalk.dim('\nShutting down bots...'));
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await Promise.all(promises);
}
