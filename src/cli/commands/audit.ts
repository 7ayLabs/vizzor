import chalk from 'chalk';
import ora from 'ora';
import { getAdapter } from '../../chains/registry.js';
import { auditContract } from '../../core/forensics/contract-auditor.js';

export async function handleAudit(
  contract: string,
  options: { chain: string; json: boolean },
): Promise<void> {
  const spinner = ora(`Auditing contract ${contract.slice(0, 10)}... on ${options.chain}`).start();

  try {
    const adapter = getAdapter(options.chain);
    await adapter.connect();

    const result = await auditContract(contract, adapter);
    await adapter.disconnect();
    spinner.stop();

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log();
    console.log(chalk.bold(`Contract Audit: ${contract}`));
    console.log(chalk.dim(`Chain: ${options.chain}`));
    console.log();

    console.log(`  Has Code:    ${result.hasCode ? chalk.green('Yes') : chalk.red('No')}`);
    console.log(`  Code Size:   ${result.codeSize} bytes`);
    console.log(`  Overall Risk: ${colorRisk(result.overallRisk)}`);
    console.log();

    if (result.findings.length > 0) {
      console.log(chalk.bold('Findings'));
      for (const finding of result.findings) {
        const icon = severityIcon(finding.severity);
        console.log(`  ${icon} [${finding.severity.toUpperCase()}] ${finding.title}`);
        console.log(chalk.dim(`    ${finding.description}`));
      }
      console.log();
    } else {
      console.log(chalk.green('  No issues detected.'));
      console.log();
    }

    console.log(chalk.dim('Note: This is a basic bytecode-level audit. For comprehensive'));
    console.log(chalk.dim('security analysis, use a professional audit service.'));
  } catch (error) {
    spinner.fail('Audit failed');
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error: ${message}`));
    process.exit(1);
  }
}

function colorRisk(level: string): string {
  switch (level) {
    case 'low':
      return chalk.green('Low');
    case 'medium':
      return chalk.yellow('Medium');
    case 'high':
      return chalk.red('High');
    case 'critical':
      return chalk.bgRed.white(' CRITICAL ');
    default:
      return level;
  }
}

function severityIcon(severity: string): string {
  switch (severity) {
    case 'critical':
      return chalk.bgRed.white('!');
    case 'high':
      return chalk.red('!');
    case 'medium':
      return chalk.yellow('!');
    case 'low':
      return chalk.blue('i');
    case 'info':
      return chalk.dim('i');
    default:
      return '-';
  }
}
