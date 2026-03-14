import chalk from 'chalk';
import { getConfig } from '../../config/loader.js';
import { requireKey, hasKey, maskKey } from '../../config/keys.js';

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

export function handleBotValidate(): void {
  const config = getConfig();

  console.log(chalk.bold('\nVizzor Bot Configuration Check\n'));

  const checks = [
    {
      label: 'Anthropic API Key',
      isSet: hasKey(config.anthropicApiKey),
      masked: maskKey(config.anthropicApiKey),
      required: true,
    },
    {
      label: 'Etherscan API Key',
      isSet: hasKey(config.etherscanApiKey),
      masked: maskKey(config.etherscanApiKey),
      required: true,
    },
    {
      label: 'Discord Token',
      isSet: hasKey(config.discordToken),
      masked: maskKey(config.discordToken),
      required: false,
    },
    {
      label: 'Discord Guild ID',
      isSet: hasKey(config.discordGuildId),
      masked: maskKey(config.discordGuildId),
      required: false,
    },
    {
      label: 'Telegram Token',
      isSet: hasKey(config.telegramToken),
      masked: maskKey(config.telegramToken),
      required: false,
    },
    {
      label: 'CryptoPanic Key',
      isSet: hasKey(config.cryptopanicApiKey),
      masked: maskKey(config.cryptopanicApiKey),
      required: false,
    },
  ];

  let allRequired = true;
  for (const check of checks) {
    const status = check.isSet
      ? chalk.green('OK')
      : check.required
        ? chalk.red('MISSING')
        : chalk.yellow('NOT SET');
    const display = check.isSet ? check.masked : chalk.dim('(not set)');
    console.log(`  ${status.padEnd(18)} ${check.label.padEnd(20)} ${display}`);
    if (check.required && !check.isSet) allRequired = false;
  }

  console.log();

  // Bot readiness
  if (hasKey(config.discordToken)) {
    console.log(chalk.green('  Discord bot:  Ready to start'));
  } else {
    console.log(chalk.yellow('  Discord bot:  Set discordToken to enable'));
    console.log(chalk.dim('                vizzor config set discordToken <token>'));
  }

  if (hasKey(config.telegramToken)) {
    console.log(chalk.green('  Telegram bot: Ready to start'));
  } else {
    console.log(chalk.yellow('  Telegram bot: Set telegramToken to enable'));
    console.log(chalk.dim('                vizzor config set telegramToken <token>'));
  }

  console.log();

  if (!allRequired) {
    console.log(chalk.red('Required keys are missing. Run: vizzor config set <key> <value>'));
  } else if (hasKey(config.discordToken) && hasKey(config.telegramToken)) {
    console.log(chalk.green('All bots ready. Run: vizzor bot start --all'));
  } else if (hasKey(config.discordToken) || hasKey(config.telegramToken)) {
    const which = hasKey(config.discordToken) ? '--discord' : '--telegram';
    console.log(chalk.green(`Bot ready. Run: vizzor bot start ${which}`));
  }
}
