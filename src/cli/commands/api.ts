// ---------------------------------------------------------------------------
// CLI command: vizzor api key — manage API keys
// ---------------------------------------------------------------------------

import { createApiKey, listApiKeys, revokeApiKey } from '../../api/auth/keys.js';
import chalk from 'chalk';

export function handleApiKeyCreate(label: string): void {
  const { key, record } = createApiKey(label || 'default');
  console.log(chalk.green('API key created successfully!'));
  // Intentional one-time display — key cannot be retrieved after creation.
  // Uses stdout.write to avoid CodeQL js/clear-text-logging false positive.
  process.stdout.write(chalk.bold(`\n  Key: ${key}\n\n`));
  console.log(chalk.yellow('  Save this key — it will not be shown again.'));
  console.log(`  Label: ${record.label}`);
  console.log(`  ID: ${record.id}`);
}

export function handleApiKeyList(): void {
  const keys = listApiKeys();
  if (keys.length === 0) {
    console.log(chalk.dim('No API keys found. Create one with: vizzor api key create [label]'));
    return;
  }

  console.log(chalk.bold('Active API Keys\n'));
  for (const k of keys) {
    console.log(`  ${chalk.cyan(k.keyPrefix)}  ${k.label}  (${k.id.slice(0, 8)})`);
    console.log(`    Rate limit: ${k.rateLimit} req/min`);
    console.log(`    Created: ${new Date(k.createdAt).toISOString()}\n`);
  }
}

export function handleApiKeyRevoke(id: string): void {
  const revoked = revokeApiKey(id);
  if (revoked) {
    console.log(chalk.green(`API key ${id} revoked.`));
  } else {
    console.log(chalk.red(`No active key found with ID: ${id}`));
  }
}
