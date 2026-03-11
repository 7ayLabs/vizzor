import chalk from 'chalk';
import ora from 'ora';
import { getAdapter } from '../../chains/registry.js';
import { analyzeWallet } from '../../core/forensics/wallet-analyzer.js';

export async function handleTrack(
  wallet: string,
  options: { chain: string; json: boolean },
): Promise<void> {
  const spinner = ora(`Analyzing wallet ${wallet.slice(0, 10)}... on ${options.chain}`).start();

  try {
    const adapter = getAdapter(options.chain);
    await adapter.connect();

    const analysis = await analyzeWallet(wallet, adapter);
    await adapter.disconnect();
    spinner.stop();

    if (options.json) {
      console.log(
        JSON.stringify(
          analysis,
          (_key, value) => (typeof value === 'bigint' ? value.toString() : (value as unknown)),
          2,
        ),
      );
      return;
    }

    console.log();
    console.log(chalk.bold(`Wallet Analysis: ${wallet}`));
    console.log(chalk.dim(`Chain: ${options.chain}`));
    console.log();

    const ethBalance = Number(analysis.balance) / 1e18;
    console.log(`  Balance: ${ethBalance.toFixed(6)} ${adapter.nativeCurrency.symbol}`);
    console.log(`  Transactions: ${analysis.transactionCount}`);
    console.log(`  Risk Level: ${colorRiskLevel(analysis.riskLevel)}`);
    console.log();

    if (analysis.patterns.length > 0) {
      console.log(chalk.bold('Detected Patterns'));
      for (const pattern of analysis.patterns) {
        const icon =
          pattern.severity === 'danger'
            ? chalk.red('!')
            : pattern.severity === 'warning'
              ? chalk.yellow('?')
              : chalk.blue('i');
        console.log(`  ${icon} ${pattern.description}`);
      }
      console.log();
    }
  } catch (error) {
    spinner.fail('Wallet analysis failed');
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error: ${message}`));
    process.exit(1);
  }
}

function colorRiskLevel(level: string): string {
  switch (level) {
    case 'clean':
      return chalk.green('Clean');
    case 'suspicious':
      return chalk.yellow('Suspicious');
    case 'flagged':
      return chalk.red('Flagged');
    default:
      return level;
  }
}
