import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import yaml from 'yaml';
import { vizzorConfigSchema } from './schema.js';
import type { VizzorConfig } from './schema.js';

let cachedConfig: VizzorConfig | null = null;

/**
 * Returns the path to the Vizzor configuration directory (~/.vizzor/).
 */
export function getConfigDir(): string {
  return join(homedir(), '.vizzor');
}

/**
 * Loads and validates the Vizzor configuration from ~/.vizzor/config.yaml.
 * Creates the config directory if it does not exist.
 * Environment variables override file-based values.
 */
export function loadConfig(): VizzorConfig {
  const configDir = getConfigDir();
  const configPath = join(configDir, 'config.yaml');

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  let raw: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    const contents = readFileSync(configPath, 'utf-8');
    const parsed: unknown = yaml.parse(contents);
    if (parsed && typeof parsed === 'object') {
      raw = parsed as Record<string, unknown>;
    }
  }

  // Environment variable overrides
  if (process.env['ANTHROPIC_API_KEY']) {
    raw['anthropicApiKey'] = process.env['ANTHROPIC_API_KEY'];
  }
  if (process.env['ETHERSCAN_API_KEY']) {
    raw['etherscanApiKey'] = process.env['ETHERSCAN_API_KEY'];
  }
  if (process.env['ALCHEMY_API_KEY']) {
    raw['alchemyApiKey'] = process.env['ALCHEMY_API_KEY'];
  }
  if (process.env['COINGECKO_API_KEY']) {
    raw['coingeckoApiKey'] = process.env['COINGECKO_API_KEY'];
  }
  if (process.env['DISCORD_TOKEN']) {
    raw['discordToken'] = process.env['DISCORD_TOKEN'];
  }
  if (process.env['DISCORD_GUILD_ID']) {
    raw['discordGuildId'] = process.env['DISCORD_GUILD_ID'];
  }
  if (process.env['TELEGRAM_BOT_TOKEN']) {
    raw['telegramToken'] = process.env['TELEGRAM_BOT_TOKEN'];
  }
  if (process.env['OPENAI_API_KEY']) {
    raw['openaiApiKey'] = process.env['OPENAI_API_KEY'];
  }
  if (process.env['GOOGLE_API_KEY']) {
    raw['googleApiKey'] = process.env['GOOGLE_API_KEY'];
  }
  if (process.env['CRYPTOPANIC_API_KEY']) {
    raw['cryptopanicApiKey'] = process.env['CRYPTOPANIC_API_KEY'];
  }
  if (process.env['VIZZOR_AI_PROVIDER']) {
    if (!raw['ai'] || typeof raw['ai'] !== 'object') {
      raw['ai'] = {};
    }
    (raw['ai'] as Record<string, unknown>)['provider'] = process.env['VIZZOR_AI_PROVIDER'];
  }

  const config = vizzorConfigSchema.parse(raw);
  cachedConfig = config;
  return config;
}

/**
 * Returns the cached configuration. Throws if loadConfig() has not been called.
 */
export function getConfig(): VizzorConfig {
  if (!cachedConfig) {
    throw new Error('Configuration not loaded. Call loadConfig() before getConfig().');
  }
  return cachedConfig;
}
