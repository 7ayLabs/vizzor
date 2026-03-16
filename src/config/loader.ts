import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
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

  // Database env overrides
  if (process.env['DATABASE_TYPE'] || process.env['DATABASE_URL']) {
    if (!raw['database'] || typeof raw['database'] !== 'object') {
      raw['database'] = {};
    }
    const db = raw['database'] as Record<string, unknown>;
    if (process.env['DATABASE_TYPE']) db['type'] = process.env['DATABASE_TYPE'];
    if (process.env['DATABASE_URL']) db['url'] = process.env['DATABASE_URL'];
  }

  // ML env overrides
  if (process.env['ML_ENABLED'] || process.env['ML_SIDECAR_URL']) {
    if (!raw['ml'] || typeof raw['ml'] !== 'object') {
      raw['ml'] = {};
    }
    const ml = raw['ml'] as Record<string, unknown>;
    if (process.env['ML_ENABLED']) ml['enabled'] = process.env['ML_ENABLED'] === 'true';
    if (process.env['ML_SIDECAR_URL']) ml['sidecarUrl'] = process.env['ML_SIDECAR_URL'];
  }

  // API env overrides
  if (process.env['API_PORT'] || process.env['API_HOST']) {
    if (!raw['api'] || typeof raw['api'] !== 'object') {
      raw['api'] = {};
    }
    const api = raw['api'] as Record<string, unknown>;
    if (process.env['API_PORT']) api['port'] = Number(process.env['API_PORT']);
    if (process.env['API_HOST']) api['host'] = process.env['API_HOST'];
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

/** Valid top-level config keys that can be set via /config set. */
const SETTABLE_KEYS: Record<string, { env: string; nested?: string }> = {
  anthropicApiKey: { env: 'ANTHROPIC_API_KEY' },
  openaiApiKey: { env: 'OPENAI_API_KEY' },
  googleApiKey: { env: 'GOOGLE_API_KEY' },
  etherscanApiKey: { env: 'ETHERSCAN_API_KEY' },
  alchemyApiKey: { env: 'ALCHEMY_API_KEY' },
  coingeckoApiKey: { env: 'COINGECKO_API_KEY' },
  cryptopanicApiKey: { env: 'CRYPTOPANIC_API_KEY' },
  defaultChain: { env: 'VIZZOR_DEFAULT_CHAIN' },
  telegramToken: { env: 'TELEGRAM_BOT_TOKEN' },
  discordToken: { env: 'DISCORD_TOKEN' },
  discordGuildId: { env: 'DISCORD_GUILD_ID' },
  'ai.provider': { env: 'VIZZOR_AI_PROVIDER', nested: 'ai' },
  'ai.model': { env: 'VIZZOR_AI_MODEL', nested: 'ai' },
  'ai.maxTokens': { env: 'VIZZOR_AI_MAX_TOKENS', nested: 'ai' },
  'ai.ollamaHost': { env: 'OLLAMA_HOST', nested: 'ai' },
  'database.type': { env: 'DATABASE_TYPE', nested: 'database' },
  'database.url': { env: 'DATABASE_URL', nested: 'database' },
  'ml.enabled': { env: 'ML_ENABLED', nested: 'ml' },
  'ml.sidecarUrl': { env: 'ML_SIDECAR_URL', nested: 'ml' },
  'ml.fallbackToRules': { env: 'ML_FALLBACK_TO_RULES', nested: 'ml' },
  'api.port': { env: 'API_PORT', nested: 'api' },
  'api.host': { env: 'API_HOST', nested: 'api' },
  'api.enableAuth': { env: 'API_ENABLE_AUTH', nested: 'api' },
  'api.corsOrigin': { env: 'API_CORS_ORIGIN', nested: 'api' },
  'n8n.enabled': { env: 'N8N_ENABLED', nested: 'n8n' },
  'n8n.webhookUrl': { env: 'N8N_WEBHOOK_URL', nested: 'n8n' },
};

/**
 * Returns the list of settable config keys with their env var names.
 */
export function getSettableKeys(): Record<string, { env: string; nested?: string }> {
  return SETTABLE_KEYS;
}

/**
 * Persists a single config key=value to ~/.vizzor/config.yaml and reloads the cache.
 * Supports dot-notation for nested keys (e.g. "ai.provider").
 */
export function saveConfigValue(key: string, value: string): void {
  if (!(key in SETTABLE_KEYS)) {
    throw new Error(
      `Unknown config key: "${key}". Valid keys: ${Object.keys(SETTABLE_KEYS).join(', ')}`,
    );
  }

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

  // Handle dot-notation (e.g. "ai.provider" -> raw.ai.provider)
  if (key.includes('.')) {
    const [section, field] = key.split('.') as [string, string];
    if (!raw[section] || typeof raw[section] !== 'object') {
      raw[section] = {};
    }
    // Parse numeric and boolean values
    let parsed: string | number | boolean = value;
    if (field === 'maxTokens' || field === 'port') parsed = Number(value);
    else if (value === 'true') parsed = true;
    else if (value === 'false') parsed = false;
    (raw[section] as Record<string, unknown>)[field] = parsed;
  } else {
    raw[key] = value;
  }

  // Validate before saving
  vizzorConfigSchema.parse(raw);

  writeFileSync(configPath, yaml.stringify(raw), { encoding: 'utf-8', mode: 0o600 });
  // Ensure restrictive perms on existing files too
  chmodSync(configPath, 0o600);

  // Invalidate cache so next getConfig() returns fresh data
  cachedConfig = null;
  loadConfig();
}
