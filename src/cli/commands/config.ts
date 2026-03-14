import chalk from 'chalk';
import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import { getConfigDir, loadConfig, getConfig } from '../../config/loader.js';
import { DEFAULT_CHAIN } from '../../config/constants.js';
import { DEFAULT_MODELS } from '../../ai/providers/types.js';
import { maskKey, validateKey } from '../../config/keys.js';

export async function handleConfigInit(): Promise<void> {
  const configDir = getConfigDir();
  const configPath = resolve(configDir, 'config.yaml');

  if (existsSync(configPath)) {
    console.log(chalk.yellow('Configuration already exists at:'), configPath);
    console.log(chalk.dim('Use "vizzor config set <key> <value>" to update values.'));
    return;
  }

  const defaultConfig = {
    anthropicApiKey: '',
    etherscanApiKey: '',
    defaultChain: DEFAULT_CHAIN,
    ai: {
      model: DEFAULT_MODELS['anthropic'],
      maxTokens: 4096,
    },
    output: {
      format: 'table',
      color: true,
      verbose: false,
    },
  };

  writeFileSync(configPath, yamlStringify(defaultConfig), 'utf-8');

  console.log(chalk.green('Configuration initialized at:'), configPath);
  console.log();
  console.log('Next steps:');
  console.log(
    `  1. Set your Anthropic API key: ${chalk.cyan('vizzor config set anthropicApiKey <your-key>')}`,
  );
  console.log(
    `  2. Set your Etherscan API key:  ${chalk.cyan('vizzor config set etherscanApiKey <your-key>')}`,
  );
  console.log(`  3. Try scanning a project:      ${chalk.cyan('vizzor scan ethereum')}`);
}

export async function handleConfigSet(key: string, value: string): Promise<void> {
  const configDir = getConfigDir();
  const configPath = resolve(configDir, 'config.yaml');

  // Validate keys for security (phishing, injection, format)
  const isSensitive = key.toLowerCase().includes('key') || key.toLowerCase().includes('token');
  if (isSensitive) {
    const error = validateKey(key, value);
    if (error && !error.startsWith('Warning:')) {
      console.log(chalk.red(`Rejected: ${error}`));
      return;
    }
    if (error?.startsWith('Warning:')) {
      console.log(chalk.yellow(error));
    }
  }

  await loadConfig();
  const config = getConfig();

  // Deep clone to avoid mutating cached config
  const updatedConfig = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;

  // Handle dot-notation for nested keys (e.g. "ai.provider" -> config.ai.provider)
  if (key.includes('.')) {
    const [section, field] = key.split('.') as [string, string];
    if (!updatedConfig[section] || typeof updatedConfig[section] !== 'object') {
      updatedConfig[section] = {};
    }
    const parsed = field === 'maxTokens' ? Number(value) : value;
    (updatedConfig[section] as Record<string, unknown>)[field] = parsed;
  } else {
    updatedConfig[key] = value;
  }

  writeFileSync(configPath, yamlStringify(updatedConfig), 'utf-8');

  const displayValue = isSensitive ? maskKey(value) : value;

  console.log(chalk.green(`Set ${key} = ${displayValue}`));
}

export async function handleConfigShow(): Promise<void> {
  await loadConfig();
  const config = getConfig();
  const configDir = getConfigDir();

  console.log();
  console.log(chalk.bold('Vizzor Configuration'));
  console.log(chalk.dim(`Location: ${resolve(configDir, 'config.yaml')}`));
  console.log();

  const entries = Object.entries(config);
  for (const [key, value] of entries) {
    if (typeof value === 'object' && value !== null) {
      console.log(`  ${chalk.bold(key)}:`);
      for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
        console.log(`    ${subKey}: ${String(subValue)}`);
      }
    } else {
      const displayValue =
        typeof value === 'string' &&
        (key.toLowerCase().includes('key') || key.toLowerCase().includes('token'))
          ? maskKey(value)
          : String(value ?? '');
      console.log(`  ${key}: ${displayValue || chalk.dim('(not set)')}`);
    }
  }
  console.log();
}
