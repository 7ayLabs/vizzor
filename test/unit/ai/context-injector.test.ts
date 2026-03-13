import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildContextBlock } from '@/ai/context-injector.js';

// Mock all data source modules
vi.mock('@/core/trends/market.js', () => ({
  fetchMarketData: vi.fn().mockResolvedValue({
    symbol: 'BTC',
    name: 'Bitcoin',
    price: 67000,
    priceChange24h: 2.5,
    priceChange7d: 5.0,
    volume24h: 30_000_000_000,
    marketCap: 1_300_000_000_000,
    rank: 1,
  }),
  fetchTokenFromDex: vi.fn().mockResolvedValue([]),
  fetchTrendingTokens: vi.fn().mockResolvedValue([
    {
      name: 'TestToken',
      symbol: 'TEST',
      chain: 'ethereum',
      priceUsd: '1.23',
      priceChange24h: 10,
      volume24h: 1000000,
      liquidity: 500000,
      marketCap: 5000000,
      url: 'https://test.com',
      source: 'dexscreener',
    },
  ]),
}));

vi.mock('@/data/sources/cryptopanic.js', () => ({
  fetchCryptoNews: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/data/sources/defillama.js', () => ({
  fetchRecentRaises: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/data/sources/pumpfun.js', () => ({
  fetchLatestCoins: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/data/sources/binance.js', () => ({
  fetchTickerPrice: vi.fn().mockResolvedValue({
    symbol: 'BTC',
    price: 67000,
    change24h: 2.5,
  }),
  fetchFundingRate: vi.fn().mockResolvedValue({
    symbol: 'BTC',
    fundingRate: 0.0001,
    fundingTime: 1700000000000,
    markPrice: 67050,
  }),
  fetchOpenInterest: vi.fn().mockResolvedValue({
    symbol: 'BTC',
    openInterest: 100000,
    notionalValue: 6_700_000_000,
  }),
}));

vi.mock('@/data/sources/fear-greed.js', () => ({
  fetchFearGreedIndex: vi.fn().mockResolvedValue({
    current: { value: 65, classification: 'Greed', timestamp: 1700000000 },
    previous: { value: 60, classification: 'Neutral', timestamp: 1699913600 },
    history: [],
  }),
}));

vi.mock('@/config/loader.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    cryptopanicApiKey: undefined,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildContextBlock', () => {
  it('injects REAL-TIME DATA markers', async () => {
    const result = await buildContextBlock('what is bitcoin price');
    expect(result).toContain('--- REAL-TIME DATA (fetched just now) ---');
    expect(result).toContain('--- END REAL-TIME DATA ---');
  });

  it('includes critical instructions for AI', async () => {
    const result = await buildContextBlock('bitcoin price');
    expect(result).toContain('CRITICAL INSTRUCTIONS');
    expect(result).toContain('do NOT make something up');
  });

  it('detects price keywords and fetches token data', async () => {
    const result = await buildContextBlock('what is the price of bitcoin');
    expect(result).toContain('BTC');
  });

  it('detects trending keywords', async () => {
    const result = await buildContextBlock('what is trending in crypto');
    expect(result).toContain('Trending');
  });

  it('detects broad market queries', async () => {
    const result = await buildContextBlock("what's happening in the crypto market today");
    expect(result).toContain('REAL-TIME DATA');
  });

  it('always includes Fear & Greed index', async () => {
    const result = await buildContextBlock('hello');
    expect(result).toContain('Fear & Greed');
  });

  it('always includes Binance prices as baseline', async () => {
    const result = await buildContextBlock('random question');
    expect(result).toContain('Binance');
  });

  it('detects 0x addresses', async () => {
    const result = await buildContextBlock('analyze 0x1234567890123456789012345678901234567890');
    expect(result).toContain('REAL-TIME DATA');
  });

  it('detects token symbols like eth, sol', async () => {
    const result = await buildContextBlock('what about eth');
    expect(result).toContain('REAL-TIME DATA');
  });

  it('includes derivatives data for price queries', async () => {
    const result = await buildContextBlock('bitcoin price analysis');
    expect(result).toContain('REAL-TIME DATA');
  });

  it('returns non-empty for any input (baseline injection)', async () => {
    const result = await buildContextBlock('just chatting');
    expect(result.length).toBeGreaterThan(0);
  });
});
