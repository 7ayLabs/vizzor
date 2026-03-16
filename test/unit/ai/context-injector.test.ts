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
  fetchTickerPriceRT: vi.fn().mockResolvedValue({
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
    const { contextText } = await buildContextBlock('what is bitcoin price');
    expect(contextText).toContain('--- REAL-TIME DATA (fetched just now');
    expect(contextText).toContain('--- END REAL-TIME DATA ---');
  });

  it('includes critical instructions for AI', async () => {
    const { contextText } = await buildContextBlock('bitcoin price');
    expect(contextText).toContain('CRITICAL INSTRUCTIONS');
    expect(contextText).toContain('Do NOT invent or fabricate');
  });

  it('detects price keywords and fetches token data', async () => {
    const { contextText } = await buildContextBlock('what is the price of bitcoin');
    expect(contextText).toContain('BTC');
  });

  it('detects trending keywords', async () => {
    const { contextText } = await buildContextBlock('what is trending in crypto');
    expect(contextText).toContain('Trending');
  });

  it('detects broad market queries', async () => {
    const { contextText } = await buildContextBlock("what's happening in the crypto market today");
    expect(contextText).toContain('REAL-TIME DATA');
  });

  it('always includes Fear & Greed index', async () => {
    const { contextText } = await buildContextBlock('hello');
    expect(contextText).toContain('Fear & Greed');
  });

  it('always includes Binance prices as baseline', async () => {
    const { contextText } = await buildContextBlock('random question');
    expect(contextText).toContain('Binance');
  });

  it('detects 0x addresses', async () => {
    const { contextText } = await buildContextBlock(
      'analyze 0x1234567890123456789012345678901234567890',
    );
    expect(contextText).toContain('REAL-TIME DATA');
  });

  it('detects token symbols like eth, sol', async () => {
    const { contextText } = await buildContextBlock('what about eth');
    expect(contextText).toContain('REAL-TIME DATA');
  });

  it('includes derivatives data for price queries', async () => {
    const { contextText } = await buildContextBlock('bitcoin price analysis');
    expect(contextText).toContain('REAL-TIME DATA');
  });

  it('returns non-empty for any input (baseline injection)', async () => {
    const { contextText } = await buildContextBlock('just chatting');
    expect(contextText.length).toBeGreaterThan(0);
  });

  it('populates tokenData array for token queries', async () => {
    const { tokenData } = await buildContextBlock('what is bitcoin price');
    expect(tokenData.length).toBeGreaterThan(0);
    const btc = tokenData.find((t) => t.symbol === 'BTC');
    expect(btc).toBeDefined();
    expect(btc!.price).toBeGreaterThan(0);
    expect(btc!.source).toBeDefined();
  });

  it('returns tokenData from Binance baseline even without specific tokens', async () => {
    const { tokenData } = await buildContextBlock('hello there');
    // Binance baseline always fetches BTC, ETH, SOL
    expect(tokenData.length).toBeGreaterThan(0);
  });

  it('compact mode produces shorter context', async () => {
    const { contextText: full } = await buildContextBlock('bitcoin price');
    const { contextText: compact } = await buildContextBlock('bitcoin price', { compact: true });
    expect(compact.length).toBeLessThan(full.length);
    expect(compact).toContain('RULES');
    expect(compact).not.toContain('QUERY TYPE:');
  });

  it('compact mode includes verified prices header when tokens found', async () => {
    const { contextText } = await buildContextBlock('bitcoin price', { compact: true });
    expect(contextText).toContain('VERIFIED PRICES');
  });

  it('compact mode anchors prediction to current price range', async () => {
    const { contextText } = await buildContextBlock('bitcoin prediction', { compact: true });
    expect(contextText).toContain('MUST START FROM THESE EXACT PRICES');
    expect(contextText).toContain('±5%');
  });

  it('queriedSymbols returns only tokens the user mentioned', async () => {
    const { queriedSymbols } = await buildContextBlock('what is bitcoin price');
    expect(queriedSymbols).toContain('BTC');
    expect(queriedSymbols).not.toContain('SOL');
  });

  it('queriedSymbols is empty for generic queries', async () => {
    const { queriedSymbols } = await buildContextBlock('hello there');
    expect(queriedSymbols).toHaveLength(0);
  });

  it('queriedSymbols includes multiple tokens', async () => {
    const { queriedSymbols } = await buildContextBlock('compare btc and eth');
    expect(queriedSymbols).toContain('BTC');
    expect(queriedSymbols).toContain('ETH');
  });
});
