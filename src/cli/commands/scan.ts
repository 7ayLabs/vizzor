import chalk from 'chalk';
import ora from 'ora';
import { getAdapter } from '../../chains/registry.js';
import { getConfig } from '../../config/loader.js';
import { analyzeProject } from '../../core/scanner/project-analyzer.js';
import { assessRisk } from '../../core/scanner/risk-scorer.js';

export async function handleScan(
  project: string,
  options: { chain: string; deep: boolean; json: boolean },
): Promise<void> {
  const spinner = ora(`Scanning ${project} on ${options.chain}...`).start();

  try {
    const adapter = getAdapter(options.chain);
    const cfg = getConfig();
    await adapter.connect(undefined, cfg.etherscanApiKey);

    spinner.text = 'Fetching on-chain data...';
    const analysis = await analyzeProject(project, adapter);
    const risk = assessRisk(analysis);

    await adapter.disconnect();
    spinner.stop();

    if (options.json) {
      console.log(JSON.stringify({ analysis, risk }, null, 2));
      return;
    }

    const riskColor =
      risk.level === 'low'
        ? chalk.green
        : risk.level === 'medium'
          ? chalk.yellow
          : risk.level === 'high'
            ? chalk.red
            : chalk.bgRed.white;

    console.log();
    console.log(chalk.bold(`Project Analysis: ${project}`));
    console.log(chalk.dim(`Chain: ${options.chain}`));
    console.log();

    if (analysis.token) {
      console.log(chalk.bold('Token Info'));
      console.log(`  Name:     ${analysis.token.name}`);
      console.log(`  Symbol:   ${analysis.token.symbol}`);
      console.log(`  Decimals: ${analysis.token.decimals}`);
      console.log();
    }

    console.log(chalk.bold('Risk Assessment'));
    console.log(`  Score: ${riskColor(`${risk.score}/100 (${risk.level.toUpperCase()})`)}`);
    console.log(`  ${risk.summary}`);
    console.log();

    if (risk.factors.length > 0) {
      console.log(chalk.bold('Risk Factors'));
      for (const factor of risk.factors) {
        console.log(`  ${chalk.red('!')} ${factor}`);
      }
      console.log();
    }

    console.log(
      chalk.dim('Disclaimer: This is not financial advice. Always do your own research.'),
    );
  } catch (error) {
    spinner.fail('Scan failed');
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error: ${message}`));
    process.exit(1);
  }
}
