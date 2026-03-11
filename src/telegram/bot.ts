import { Bot } from 'grammy';
import { getConfig } from '../config/loader.js';
import { registerCommands } from './commands/index.js';

export async function startTelegramBot(): Promise<void> {
  const config = getConfig();
  const token = config.telegramToken;

  if (!token) {
    throw new Error('Telegram token not configured. Run: vizzor config set telegramToken <token>');
  }

  const bot = new Bot(token);

  registerCommands(bot);

  bot.catch((err) => {
    console.error('Telegram bot error:', err.message);
  });

  console.log('Telegram bot starting...');
  await bot.start({
    onStart: (botInfo) => {
      console.log(`Telegram bot started as @${botInfo.username}`);
    },
  });
}
