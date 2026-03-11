import { describe, it, expect } from 'vitest';
import { vizzorConfigSchema } from '@/config/schema.js';

describe('vizzorConfigSchema', () => {
  it('parses empty object with defaults', () => {
    const result = vizzorConfigSchema.parse({});
    expect(result.defaultChain).toBe('ethereum');
    expect(result.ai.model).toBe('claude-sonnet-4-20250514');
    expect(result.ai.maxTokens).toBe(4096);
    expect(result.output.format).toBe('table');
    expect(result.output.color).toBe(true);
    expect(result.output.verbose).toBe(false);
    expect(result.cacheTtl.tokenInfo).toBe(3600);
    expect(result.cacheTtl.marketData).toBe(300);
  });

  it('accepts valid config with overrides', () => {
    const result = vizzorConfigSchema.parse({
      defaultChain: 'polygon',
      ai: { model: 'claude-opus-4-20250514', maxTokens: 8192 },
      output: { format: 'json' },
    });
    expect(result.defaultChain).toBe('polygon');
    expect(result.ai.model).toBe('claude-opus-4-20250514');
    expect(result.ai.maxTokens).toBe(8192);
    expect(result.output.format).toBe('json');
  });

  it('validates output format enum', () => {
    expect(() => vizzorConfigSchema.parse({ output: { format: 'invalid' } })).toThrow();
  });

  it('accepts optional API keys', () => {
    const result = vizzorConfigSchema.parse({
      anthropicApiKey: 'sk-ant-test',
      etherscanApiKey: 'ETHERSCAN_KEY',
      discordToken: 'discord-token',
      telegramToken: 'telegram-token',
    });
    expect(result.anthropicApiKey).toBe('sk-ant-test');
    expect(result.discordToken).toBe('discord-token');
    expect(result.telegramToken).toBe('telegram-token');
  });

  it('accepts RPC overrides', () => {
    const result = vizzorConfigSchema.parse({
      rpc: { ethereum: 'https://rpc.example.com', polygon: 'https://polygon.example.com' },
    });
    expect(result.rpc.ethereum).toBe('https://rpc.example.com');
    expect(result.rpc.polygon).toBe('https://polygon.example.com');
  });
});
