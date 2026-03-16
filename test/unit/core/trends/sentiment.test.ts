import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock functions (available inside vi.mock factories)
// ---------------------------------------------------------------------------

const {
  mockFetchCryptoNews,
  mockSearchTokens,
  mockGetMLClient,
  mockInitMLClient,
  mockAnalyzeSentimentBatch,
} = vi.hoisted(() => ({
  mockFetchCryptoNews: vi.fn(),
  mockSearchTokens: vi.fn(),
  mockGetMLClient: vi.fn().mockReturnValue(null),
  mockInitMLClient: vi.fn(),
  mockAnalyzeSentimentBatch: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock all external dependencies
// ---------------------------------------------------------------------------

vi.mock('@/data/sources/cryptopanic.js', () => ({
  fetchCryptoNews: mockFetchCryptoNews,
}));

vi.mock('@/data/sources/dexscreener.js', () => ({
  searchTokens: mockSearchTokens,
}));

vi.mock('@/config/loader.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    cryptopanicApiKey: 'test-key',
    ml: { enabled: false },
  }),
}));

vi.mock('@/ml/client.js', () => ({
  getMLClient: (...args: unknown[]) => mockGetMLClient(...args),
  initMLClient: (...args: unknown[]) => mockInitMLClient(...args),
}));

import { analyzeSentiment } from '@/core/trends/sentiment.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMLClient.mockReturnValue(null);
  mockSearchTokens.mockResolvedValue([]);
  mockFetchCryptoNews.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeNews(overrides: { title?: string; sentiment?: string } = {}) {
  return {
    id: Math.floor(Math.random() * 10000),
    title: overrides.title ?? 'Test headline',
    url: 'https://example.com',
    source: { title: 'TestSource', domain: 'example.com' },
    sentiment: overrides.sentiment ?? 'neutral',
    currencies: [{ code: 'BTC', title: 'Bitcoin' }],
    publishedAt: new Date().toISOString(),
    kind: 'news' as const,
  };
}

function makeDexPair(buys: number, sells: number, priceChange = 0) {
  return {
    chainId: 'ethereum',
    dexId: 'uniswap',
    pairAddress: '0xpair',
    url: 'https://dexscreener.com/pair',
    baseToken: { address: '0xtoken', name: 'TestToken', symbol: 'TEST' },
    quoteToken: { address: '0xweth', name: 'WETH', symbol: 'WETH' },
    priceNative: '0.001',
    priceUsd: '3.50',
    txns: {
      m5: { buys: 0, sells: 0 },
      h1: { buys: 0, sells: 0 },
      h6: { buys: 0, sells: 0 },
      h24: { buys, sells },
    },
    volume: { m5: 0, h1: 0, h6: 0, h24: 500000 },
    priceChange: { m5: 0, h1: 0, h6: 0, h24: priceChange },
    liquidity: { usd: 1000000, base: 100, quote: 50 },
    fdv: null,
    marketCap: null,
    pairCreatedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('analyzeSentiment', () => {
  it('returns positive consensus when majority of news is positive', async () => {
    const news = [
      makeNews({ sentiment: 'positive' }),
      makeNews({ sentiment: 'positive' }),
      makeNews({ sentiment: 'positive' }),
      makeNews({ sentiment: 'neutral' }),
    ];
    mockFetchCryptoNews.mockResolvedValueOnce(news);

    const result = await analyzeSentiment('BTC');

    expect(result.consensus).toBe('positive');
    expect(result.overall).toBeGreaterThan(0.2);
    expect(result.sources.length).toBeGreaterThanOrEqual(1);
    expect(result.sources[0]!.source).toBe('CryptoPanic News');
  });

  it('returns negative consensus when majority of news is negative', async () => {
    const news = [
      makeNews({ sentiment: 'negative' }),
      makeNews({ sentiment: 'negative' }),
      makeNews({ sentiment: 'negative' }),
      makeNews({ sentiment: 'neutral' }),
    ];
    mockFetchCryptoNews.mockResolvedValueOnce(news);

    const result = await analyzeSentiment('BTC');

    expect(result.consensus).toBe('negative');
    expect(result.overall).toBeLessThan(-0.2);
  });

  it('returns mixed consensus when sources strongly disagree', async () => {
    // CryptoPanic: very positive news
    const news = [
      makeNews({ sentiment: 'positive' }),
      makeNews({ sentiment: 'positive' }),
      makeNews({ sentiment: 'positive' }),
    ];
    mockFetchCryptoNews.mockResolvedValueOnce(news);

    // DexScreener: heavy sell pressure (negative score)
    mockSearchTokens.mockResolvedValueOnce([makeDexPair(10, 90)]);

    const result = await analyzeSentiment('BTC');

    // Sources disagree by more than 0.5 and overall is within [-0.2, 0.2]
    expect(result.consensus).toBe('mixed');
    expect(result.sources.length).toBe(2);
  });

  it('returns neutral consensus when no data available', async () => {
    mockFetchCryptoNews.mockResolvedValueOnce([]);
    mockSearchTokens.mockResolvedValueOnce([]);

    const result = await analyzeSentiment('UNKNOWN');

    expect(result.overall).toBe(0);
    expect(result.consensus).toBe('neutral');
    expect(result.sources).toEqual([]);
  });

  it('handles CryptoPanic API failure gracefully', async () => {
    mockFetchCryptoNews.mockRejectedValueOnce(new Error('API down'));
    mockSearchTokens.mockResolvedValueOnce([makeDexPair(60, 40)]);

    const result = await analyzeSentiment('ETH');

    // Should still return DexScreener data
    expect(result.sources.length).toBe(1);
    expect(result.sources[0]!.source).toBe('DexScreener Market');
  });

  it('handles DexScreener API failure gracefully', async () => {
    const news = [makeNews({ sentiment: 'positive' })];
    mockFetchCryptoNews.mockResolvedValueOnce(news);
    mockSearchTokens.mockRejectedValueOnce(new Error('DexScreener down'));

    const result = await analyzeSentiment('BTC');

    expect(result.sources.length).toBe(1);
    expect(result.sources[0]!.source).toBe('CryptoPanic News');
  });

  it('handles both APIs failing gracefully', async () => {
    mockFetchCryptoNews.mockRejectedValueOnce(new Error('API down'));
    mockSearchTokens.mockRejectedValueOnce(new Error('DexScreener down'));

    const result = await analyzeSentiment('BTC');

    expect(result.overall).toBe(0);
    expect(result.consensus).toBe('neutral');
    expect(result.sources).toEqual([]);
  });

  it('calculates DexScreener buy/sell ratio correctly', async () => {
    // 80 buys / 20 sells -> buy ratio 0.8 -> score (0.8 - 0.5)*2 = 0.6
    mockSearchTokens.mockResolvedValueOnce([makeDexPair(80, 20, 5.0)]);

    const result = await analyzeSentiment('TEST');

    const dexSource = result.sources.find((s) => s.source === 'DexScreener Market');
    expect(dexSource).toBeDefined();
    expect(dexSource!.score).toBeCloseTo(0.6);
    expect(dexSource!.volume).toBe(100);
    expect(dexSource!.topMentions).toContain('TEST: $3.50');
  });

  it('handles DexScreener pair with zero transactions', async () => {
    mockSearchTokens.mockResolvedValueOnce([makeDexPair(0, 0)]);

    const result = await analyzeSentiment('TEST');

    const dexSource = result.sources.find((s) => s.source === 'DexScreener Market');
    expect(dexSource).toBeDefined();
    expect(dexSource!.score).toBe(0);
    expect(dexSource!.volume).toBe(0);
  });

  it('marks news as trending when count exceeds 5', async () => {
    const news = Array.from({ length: 8 }, () => makeNews({ sentiment: 'positive' }));
    mockFetchCryptoNews.mockResolvedValueOnce(news);

    const result = await analyzeSentiment('BTC');

    const newsSource = result.sources.find((s) => s.source === 'CryptoPanic News');
    expect(newsSource).toBeDefined();
    expect(newsSource!.trending).toBe(true);
    expect(newsSource!.volume).toBe(8);
  });

  it('marks news as not trending when count is 5 or fewer', async () => {
    const news = Array.from({ length: 3 }, () => makeNews({ sentiment: 'neutral' }));
    mockFetchCryptoNews.mockResolvedValueOnce(news);

    const result = await analyzeSentiment('BTC');

    const newsSource = result.sources.find((s) => s.source === 'CryptoPanic News');
    expect(newsSource).toBeDefined();
    expect(newsSource!.trending).toBe(false);
  });

  // -------------------------------------------------------------------------
  // ML NLP sentiment integration
  // -------------------------------------------------------------------------

  describe('ML NLP sentiment integration', () => {
    it('uses ML sentiment batch analysis when ML client is available', async () => {
      const news = [
        makeNews({ title: 'BTC surges to ATH' }),
        makeNews({ title: 'Massive adoption wave' }),
      ];
      mockFetchCryptoNews.mockResolvedValueOnce(news);

      const mlClient = {
        analyzeSentimentBatch: mockAnalyzeSentimentBatch,
      };
      mockGetMLClient.mockReturnValue(mlClient);
      mockAnalyzeSentimentBatch.mockResolvedValueOnce([
        { score: 0.8, confidence: 0.9, key_topics: ['price', 'ATH'], model: 'test' },
        { score: 0.6, confidence: 0.85, key_topics: ['adoption'], model: 'test' },
      ]);

      const result = await analyzeSentiment('BTC');

      expect(mockAnalyzeSentimentBatch).toHaveBeenCalledWith([
        'BTC surges to ATH',
        'Massive adoption wave',
      ]);

      const mlSource = result.sources.find((s) => s.source === 'ML NLP Sentiment');
      expect(mlSource).toBeDefined();
      expect(mlSource!.score).toBeCloseTo(0.7); // average of 0.8 and 0.6
      expect(mlSource!.mlSentiment).toBe('bullish');
      expect(mlSource!.mlConfidence).toBeCloseTo(0.875);
      expect(mlSource!.mlTopics).toContain('price');
      expect(mlSource!.mlTopics).toContain('adoption');
    });

    it('labels ML sentiment as bearish for negative scores', async () => {
      const news = [makeNews({ title: 'Market crash' })];
      mockFetchCryptoNews.mockResolvedValueOnce(news);

      const mlClient = {
        analyzeSentimentBatch: mockAnalyzeSentimentBatch,
      };
      mockGetMLClient.mockReturnValue(mlClient);
      mockAnalyzeSentimentBatch.mockResolvedValueOnce([
        { score: -0.7, confidence: 0.8, key_topics: ['crash'], model: 'test' },
      ]);

      const result = await analyzeSentiment('BTC');

      const mlSource = result.sources.find((s) => s.source === 'ML NLP Sentiment');
      expect(mlSource).toBeDefined();
      expect(mlSource!.mlSentiment).toBe('bearish');
    });

    it('labels ML sentiment as neutral for scores near zero', async () => {
      const news = [makeNews({ title: 'Sideways movement' })];
      mockFetchCryptoNews.mockResolvedValueOnce(news);

      const mlClient = {
        analyzeSentimentBatch: mockAnalyzeSentimentBatch,
      };
      mockGetMLClient.mockReturnValue(mlClient);
      mockAnalyzeSentimentBatch.mockResolvedValueOnce([
        { score: 0.1, confidence: 0.6, key_topics: ['sideways'], model: 'test' },
      ]);

      const result = await analyzeSentiment('BTC');

      const mlSource = result.sources.find((s) => s.source === 'ML NLP Sentiment');
      expect(mlSource).toBeDefined();
      expect(mlSource!.mlSentiment).toBe('neutral');
    });

    it('falls back to count-based scoring when ML returns empty results', async () => {
      const news = [makeNews({ sentiment: 'positive' }), makeNews({ sentiment: 'positive' })];
      mockFetchCryptoNews.mockResolvedValueOnce(news);

      const mlClient = {
        analyzeSentimentBatch: mockAnalyzeSentimentBatch,
      };
      mockGetMLClient.mockReturnValue(mlClient);
      mockAnalyzeSentimentBatch.mockResolvedValueOnce([]);

      const result = await analyzeSentiment('BTC');

      const newsSource = result.sources.find((s) => s.source === 'CryptoPanic News');
      expect(newsSource).toBeDefined();
      expect(newsSource!.mlSentiment).toBeUndefined();
      // count-based: 2 positive out of 2 -> score = 1.0
      expect(newsSource!.score).toBe(1.0);
    });
  });
});
