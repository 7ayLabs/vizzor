import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadConfig } from './config/loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8')) as {
  version: string;
};

const program = new Command()
  .name('vizzor')
  .description('Crypto chronovisor — AI-powered on-chain intelligence')
  .version(pkg.version);

program.hook('preAction', async () => {
  await loadConfig();
});

// Lazy-load commands to speed up CLI startup
program
  .command('scan <project>')
  .description('Analyze a crypto project')
  .option('--chain <chain>', 'Target chain', 'ethereum')
  .option('--deep', 'Deep analysis including contract audit', false)
  .option('--json', 'Output as JSON', false)
  .action(async (project: string, options: { chain: string; deep: boolean; json: boolean }) => {
    const { handleScan } = await import('./cli/commands/scan.js');
    await handleScan(project, options);
  });

program
  .command('trends')
  .description('Analyze market trends')
  .option('--sentiment', 'Include sentiment analysis', false)
  .option('--chain <chain>', 'Filter by chain', 'ethereum')
  .option('--json', 'Output as JSON', false)
  .action(async (options: { sentiment: boolean; chain: string; json: boolean }) => {
    const { handleTrends } = await import('./cli/commands/trends.js');
    await handleTrends(options);
  });

program
  .command('track <wallet>')
  .description('Analyze a wallet address')
  .option('--chain <chain>', 'Target chain', 'ethereum')
  .option('--json', 'Output as JSON', false)
  .action(async (wallet: string, options: { chain: string; json: boolean }) => {
    const { handleTrack } = await import('./cli/commands/track.js');
    await handleTrack(wallet, options);
  });

const icoCmd = program.command('ico').description('ICO/IDO tracker');

icoCmd
  .command('list')
  .description('List upcoming ICOs/IDOs')
  .option('--category <category>', 'Filter by category')
  .option('--chain <chain>', 'Filter by chain')
  .option('--json', 'Output as JSON', false)
  .action(async (options: { category?: string; chain?: string; json: boolean }) => {
    const { handleIcoList } = await import('./cli/commands/ico.js');
    await handleIcoList(options);
  });

program
  .command('audit <contract>')
  .description('Basic smart contract audit')
  .option('--chain <chain>', 'Target chain', 'ethereum')
  .option('--json', 'Output as JSON', false)
  .action(async (contract: string, options: { chain: string; json: boolean }) => {
    const { handleAudit } = await import('./cli/commands/audit.js');
    await handleAudit(contract, options);
  });

const configCmd = program.command('config').description('Configuration management');

configCmd
  .command('init')
  .description('Initialize configuration')
  .action(async () => {
    const { handleConfigInit } = await import('./cli/commands/config.js');
    await handleConfigInit();
  });

configCmd
  .command('set <key> <value>')
  .description('Set a configuration value')
  .action(async (key: string, value: string) => {
    const { handleConfigSet } = await import('./cli/commands/config.js');
    await handleConfigSet(key, value);
  });

configCmd
  .command('show')
  .description('Show current configuration')
  .action(async () => {
    const { handleConfigShow } = await import('./cli/commands/config.js');
    await handleConfigShow();
  });

const botCmd = program.command('bot').description('Bot management');

botCmd
  .command('start')
  .description('Start bot(s)')
  .option('--discord', 'Start Discord bot', false)
  .option('--telegram', 'Start Telegram bot', false)
  .option('--all', 'Start all bots', false)
  .action(async (options: { discord: boolean; telegram: boolean; all: boolean }) => {
    const { handleBotStart } = await import('./cli/commands/bot.js');
    await handleBotStart(options);
  });

botCmd
  .command('validate')
  .description('Check bot token configuration')
  .action(async () => {
    const { handleBotValidate } = await import('./cli/commands/bot.js');
    handleBotValidate();
  });

const collectCmd = program.command('collect').description('Data collection pipeline');

collectCmd
  .command('start')
  .description('Start background OHLCV data collection (requires PostgreSQL)')
  .option('--symbols <symbols>', 'Comma-separated symbols to collect (default: 23 major pairs)')
  .option('--interval <seconds>', 'Collection interval in seconds (default: 300)', parseInt)
  .action(async (options: { symbols?: string; interval?: number }) => {
    const { handleCollectStart } = await import('./cli/commands/collect.js');
    await handleCollectStart(options);
  });

collectCmd
  .command('status')
  .description('Show data collection status')
  .action(async () => {
    const { handleCollectStatus } = await import('./cli/commands/collect.js');
    handleCollectStatus();
  });

// If no arguments provided, launch interactive TUI
const args = process.argv.slice(2);
if (args.length === 0) {
  await loadConfig();
  const { startTUI } = await import('./tui/app.js');
  startTUI();
} else {
  program.parse();
}
