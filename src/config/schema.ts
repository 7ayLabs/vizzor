import { z } from 'zod/v4';

export const vizzorConfigSchema = z.object({
  anthropicApiKey: z.string().optional(),
  etherscanApiKey: z.string().optional(),
  alchemyApiKey: z.string().optional(),
  coingeckoApiKey: z.string().optional(),
  defaultChain: z.string().default('ethereum'),
  rpc: z.record(z.string(), z.string()).default({}),
  ai: z
    .object({
      model: z.string().default('claude-sonnet-4-20250514'),
      maxTokens: z.number().default(4096),
    })
    .default(() => ({ model: 'claude-sonnet-4-20250514', maxTokens: 4096 })),
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
  discordToken: z.string().optional(),
  discordGuildId: z.string().optional(),
  telegramToken: z.string().optional(),
});

export type VizzorConfig = z.infer<typeof vizzorConfigSchema>;
