import chalk from 'chalk';
import ora from 'ora';
import { fetchUpcomingICOs, searchICOs } from '../../core/scanner/ico-tracker.js';

export async function handleIcoList(options: {
  category?: string;
  chain?: string;
  json: boolean;
}): Promise<void> {
  const spinner = ora('Fetching ICO data...').start();

  try {
    const icos =
      options.category || options.chain
        ? await searchICOs(undefined, options.category, options.chain)
        : await fetchUpcomingICOs();

    spinner.stop();

    if (options.json) {
      console.log(JSON.stringify(icos, null, 2));
      return;
    }

    console.log();
    console.log(chalk.bold('Upcoming ICOs / IDOs'));
    console.log();

    if (icos.length === 0) {
      console.log(chalk.dim('  No ICOs found. ICO tracking APIs will be integrated soon.'));
      console.log(chalk.dim('  Sources planned: ICODrops, CoinGecko, DeFiLlama'));
      console.log();
      return;
    }

    for (const ico of icos) {
      const statusColor =
        ico.status === 'active' ? chalk.green : ico.status === 'upcoming' ? chalk.blue : chalk.dim;

      console.log(
        `  ${statusColor(ico.status.toUpperCase())} ${chalk.bold(ico.name)} (${ico.symbol})`,
      );
      console.log(`    Chain: ${ico.chain} | Category: ${ico.category}`);
      if (ico.startDate) {
        console.log(`    Start: ${ico.startDate}`);
      }
      if (ico.targetAmount) {
        console.log(`    Target: $${ico.targetAmount.toLocaleString()}`);
      }
      console.log();
    }
  } catch (error) {
    spinner.fail('Failed to fetch ICO data');
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error: ${message}`));
    process.exit(1);
  }
}
