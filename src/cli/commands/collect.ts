// ---------------------------------------------------------------------------
// CLI command: vizzor collect — manage background data collection
// ---------------------------------------------------------------------------

import { getConfig } from '../../config/loader.js';
import { getStore } from '../../data/store-factory.js';
import { DataCollector } from '../../data/collector.js';
import chalk from 'chalk';

let collector: DataCollector | null = null;

export async function handleCollectStart(options: {
  symbols?: string;
  interval?: number;
}): Promise<void> {
  const config = getConfig();

  if (config.database?.type !== 'postgres' || !config.database.url) {
    console.log(
      chalk.yellow(
        'Data collection requires PostgreSQL + TimescaleDB.\n' +
          'Set database.type = "postgres" and database.url in your config.\n\n' +
          'Example:\n' +
          '  vizzor config set database.type postgres\n' +
          '  vizzor config set database.url postgres://user:pass@localhost:5432/vizzor',
      ),
    );
    return;
  }

  const store = await getStore(config);
  const symbols = options.symbols
    ? options.symbols.split(',').map((s) => s.trim().toUpperCase())
    : undefined;
  const intervalMs = options.interval ? options.interval * 1000 : undefined;

  collector = new DataCollector(store, symbols, intervalMs);
  collector.start();

  console.log(chalk.green('Data collector started'));
  const status = collector.getStatus();
  console.log(`  Symbols: ${status.symbols.length} pairs`);
  console.log(`  Timeframes: ${status.timeframes.join(', ')}`);
  console.log(`  Interval: ${status.intervalMs / 1000}s`);
  console.log(chalk.dim('\nPress Ctrl+C to stop'));

  // Keep process alive
  process.on('SIGINT', () => {
    collector?.stop();
    void store.close();
    process.exit(0);
  });

  // Block indefinitely
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  await new Promise(() => {});
}

export function handleCollectStatus(): void {
  if (!collector) {
    console.log(chalk.yellow('No collector running in this process.'));
    console.log(chalk.dim('Start with: vizzor collect start'));
    return;
  }

  const status = collector.getStatus();
  console.log(chalk.bold('Data Collector Status'));
  console.log(`  Running: ${status.running ? chalk.green('yes') : chalk.red('no')}`);
  console.log(`  Symbols: ${status.symbols.length} pairs`);
  console.log(`  Timeframes: ${status.timeframes.join(', ')}`);
  console.log(`  Interval: ${status.intervalMs / 1000}s`);
  console.log(`  Last run: ${status.lastRun ? new Date(status.lastRun).toISOString() : 'never'}`);
  console.log(`  Total records: ${status.totalRecords.toLocaleString()}`);
  console.log(`  Errors: ${status.errors}`);
}
