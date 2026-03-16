import { describe, it, expect } from 'vitest';
import {
  escapeMarkdown,
  formatPrice,
  formatChange,
  formatVolume,
  formatTrending,
  formatGainersLosers,
  formatICOs,
  formatAudit,
  formatWalletAnalysis,
} from '@/telegram/formatters/market.js';

describe('escapeMarkdown', () => {
  it('escapes special MarkdownV2 characters', () => {
    expect(escapeMarkdown('hello_world')).toBe('hello\\_world');
    expect(escapeMarkdown('price: $100')).toBe('price: $100'); // $ is not a MarkdownV2 special char
    expect(escapeMarkdown('a*b')).toBe('a\\*b');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeMarkdown('hello')).toBe('hello');
  });
});

describe('formatPrice', () => {
  it('formats large prices with locale', () => {
    const result = formatPrice(67000);
    expect(result).toBeTruthy();
  });

  it('formats small prices with precision', () => {
    const result = formatPrice(0.0023);
    expect(result).toBeTruthy();
  });
});

describe('formatChange', () => {
  it('shows green emoji for positive', () => {
    expect(formatChange(5.2)).toContain('🟢');
  });

  it('shows red emoji for negative', () => {
    expect(formatChange(-3.1)).toContain('🔴');
  });
});

describe('formatVolume', () => {
  it('formats billions', () => {
    expect(formatVolume(2.5e9)).toContain('B');
  });

  it('formats millions', () => {
    expect(formatVolume(1.5e6)).toContain('M');
  });

  it('formats thousands', () => {
    expect(formatVolume(5000)).toContain('K');
  });
});

describe('formatTrending', () => {
  it('formats trending items with MarkdownV2', () => {
    const result = formatTrending([
      {
        name: 'Bitcoin',
        symbol: 'BTC',
        chain: 'ethereum',
        priceUsd: '67000',
        priceChange24h: 2.5,
        volume24h: 1e9,
        source: 'DexScreener',
      },
    ]);
    expect(result).toContain('Trending');
    expect(result).toContain('BTC');
  });
});

describe('formatGainersLosers', () => {
  it('formats gainers and losers sections', () => {
    const result = formatGainersLosers(
      [{ symbol: 'XYZ', price: 1.5, change24h: 50, volume: 1e6 }],
      [{ symbol: 'ABC', price: 0.5, change24h: -30, volume: 5e5 }],
    );
    expect(result).toContain('Gainers');
    expect(result).toContain('Losers');
  });
});

describe('formatICOs', () => {
  it('formats ICO list', () => {
    const result = formatICOs([
      {
        name: 'TestProject',
        round: 'Seed',
        amount: 5e6,
        chains: ['ethereum'],
        leadInvestors: ['a16z'],
        date: '2026-03-10',
      },
    ]);
    expect(result).toContain('TestProject');
    expect(result).toContain('Seed');
  });
});

describe('formatAudit', () => {
  it('formats audit with findings', () => {
    const result = formatAudit('0x123', 'medium', [
      { severity: 'high', title: 'Mint', description: 'Owner can mint' },
    ]);
    expect(result).toContain('Audit');
    expect(result).toContain('MEDIUM');
    expect(result).toContain('Mint');
  });

  it('formats audit without findings', () => {
    const result = formatAudit('0x456', 'low', []);
    expect(result).toContain('No significant findings');
  });
});

describe('formatWalletAnalysis', () => {
  it('formats wallet info with patterns', () => {
    const result = formatWalletAnalysis('0xabc', 'ethereum', '1.5', 42, 'low', [
      { severity: 'info', description: 'Regular transfers' },
    ]);
    expect(result).toContain('0xabc');
    expect(result).toContain('LOW');
    expect(result).toContain('Regular transfers');
  });
});
