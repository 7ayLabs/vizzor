import { z } from 'zod/v4';

export const vizzorConfigSchema = z.object({
  anthropicApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
  googleApiKey: z.string().optional(),
  etherscanApiKey: z.string().optional(),
  alchemyApiKey: z.string().optional(),
  coingeckoApiKey: z.string().optional(),
  cryptopanicApiKey: z.string().optional(),
  defaultChain: z.string().default('ethereum'),
  rpc: z.record(z.string(), z.string()).default({}),
  ai: z
    .object({
      provider: z.enum(['anthropic', 'openai', 'gemini', 'ollama']).default('anthropic'),
      model: z.string().optional(),
      maxTokens: z.number().default(4096),
      ollamaHost: z.string().default('http://localhost:11434'),
    })
    .default(() => ({
      provider: 'anthropic' as const,
      maxTokens: 4096,
      ollamaHost: 'http://localhost:11434',
    })),
  output: z
    .object({
      format: z.enum(['table', 'json', 'markdown']).default('table'),
      color: z.boolean().default(true),
      verbose: z.boolean().default(false),
    })
    .default(() => ({ format: 'table' as const, color: true, verbose: false })),
  cacheTtl: z
    .object({
      tokenInfo: z.number().default(3600),
      marketData: z.number().default(300),
      walletData: z.number().default(600),
      contractCode: z.number().default(86400),
    })
    .default(() => ({ tokenInfo: 3600, marketData: 300, walletData: 600, contractCode: 86400 })),
  database: z
    .object({
      type: z.enum(['sqlite', 'postgres']).default('sqlite'),
      url: z.string().optional(),
    })
    .default(() => ({ type: 'sqlite' as const })),
  ml: z
    .object({
      enabled: z.boolean().default(false),
      sidecarUrl: z.string().default('http://localhost:8000'),
      fallbackToRules: z.boolean().default(true),
    })
    .default(() => ({
      enabled: false,
      sidecarUrl: 'http://localhost:8000',
      fallbackToRules: true,
    })),
  api: z
    .object({
      port: z.number().default(3000),
      host: z.string().default('0.0.0.0'),
      enableAuth: z.boolean().default(true),
      corsOrigin: z.string().default('http://localhost:3000'),
    })
    .default(() => ({
      port: 3000,
      host: '0.0.0.0',
      enableAuth: true,
      corsOrigin: 'http://localhost:3000',
    })),
  n8n: z
    .object({
      enabled: z.boolean().default(false),
      webhookUrl: z.string().optional(),
    })
    .default(() => ({ enabled: false })),
  realtime: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.enum(['binance']).default('binance'),
      symbols: z.array(z.string()).default([]),
    })
    .optional(),
  trading: z
    .object({
      enabled: z.boolean().default(false),
      maxSlippage: z.number().default(0.5),
      gasMultiplier: z.number().default(1.2),
      confirmBeforeExecute: z.boolean().default(true),
      dryRun: z.boolean().default(true),
      walletName: z.string().optional(),
    })
    .optional(),
  discordToken: z.string().optional(),
  discordGuildId: z.string().optional(),
  telegramToken: z.string().optional(),
});

export type VizzorConfig = z.infer<typeof vizzorConfigSchema>;
