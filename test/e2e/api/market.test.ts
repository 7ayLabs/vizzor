// ---------------------------------------------------------------------------
// E2E tests — Market API routes (/v1/market/*)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any source import that depends on them
// ---------------------------------------------------------------------------

vi.mock('@/ai/tool-handler.js', () => ({
  handleTool: vi.fn(async (tool: string, args: Record<string, unknown>) => {
    switch (tool) {
      case 'get_market_data':
        return {
          symbol: args['symbol'],
          price: 67850.42,
          change24h: 3.21,
          volume24h: 28_500_000_000,
          marketCap: 1_330_000_000_000,
          high24h: 68200,
          low24h: 65100,
        };
      case 'get_trending':
        return {
          tokens: [
            { symbol: 'PEPE', name: 'Pepe', rank: 1 },
            { symbol: 'WIF', name: 'dogwifhat', rank: 2 },
            { symbol: 'BONK', name: 'Bonk', rank: 3 },
          ],
        };
      case 'get_fear_greed':
        return {
          value: 72,
          classification: 'Greed',
          timestamp: '2026-03-14T00:00:00Z',
          previousValue: 68,
          previousClassification: 'Greed',
        };
      case 'get_crypto_news':
        if (args['symbol']) {
          return {
            articles: [
              {
                title: `${args['symbol']} hits new highs`,
                source: 'CoinDesk',
                url: 'https://example.com/1',
                publishedAt: '2026-03-14T10:00:00Z',
              },
            ],
          };
        }
        return {
          articles: [
            {
              title: 'Crypto market rally continues',
              source: 'CryptoSlate',
              url: 'https://example.com/2',
              publishedAt: '2026-03-14T09:00:00Z',
            },
            {
              title: 'DeFi TVL reaches new record',
              source: 'The Block',
              url: 'https://example.com/3',
              publishedAt: '2026-03-14T08:00:00Z',
            },
          ],
        };
      case 'get_prediction':
        return {
          symbol: args['symbol'],
          direction: 'bullish',
          confidence: 0.78,
          signals: ['RSI neutral', 'MACD bullish crossover'],
          timeframe: '7d',
        };
      case 'search_token_dex':
        return {
          results: [
            {
              name: 'Pepe',
              symbol: 'PEPE',
              address: '0x6982...dead',
              chain: 'ethereum',
              priceUsd: '0.0000089',
            },
          ],
        };
      case 'get_derivatives_data':
        return {
          symbol: args['symbol'],
          fundingRate: 0.0123,
          openInterest: 12_500_000_000,
          longShortRatio: 1.35,
          topTraderSentiment: 'bullish',
        };
      default:
        return {};
    }
  }),
}));

vi.mock('@/api/auth/middleware.js', () => ({
  authMiddleware: vi.fn(async () => {
    // No-op: allow all requests through in tests
  }),
}));

vi.mock('@/data/cache.js', () => ({
  getDb: () => ({
    exec: vi.fn(),
    prepare: vi.fn(() => ({
      run: vi.fn(() => ({ changes: 0 })),
      all: vi.fn(() => []),
      get: vi.fn(),
    })),
  }),
}));

vi.mock('@/api/middleware/error-handler.js', () => ({
  errorHandler: vi.fn(
    (
      error: unknown,
      _request: unknown,
      reply: { status: (n: number) => { send: (o: unknown) => void } },
    ) => {
      const message = error instanceof Error ? error.message : 'Internal Server Error';
      reply.status(500).send({ error: message });
    },
  ),
}));

vi.mock('@/ml/client.js', () => ({
  getMLClient: vi.fn(() => ({
    getModelHealth: vi.fn(async () => ({
      models: ['rug', 'trend', 'regime', 'sentiment'],
      uptime: 3600,
      predictionsServed: 1250,
    })),
    analyzeSentiment: vi.fn(async () => ({
      sentiment: 'positive',
      confidence: 0.85,
      scores: { positive: 0.85, negative: 0.05, neutral: 0.1 },
    })),
    detectRegime: vi.fn(async () => ({
      regime: 'bullish',
      confidence: 0.72,
      description: 'Strong upward trend',
    })),
    scoreTrend: vi.fn(async () => ({
      score: 0.81,
      direction: 'up',
      strength: 'strong',
    })),
  })),
  initMLClient: vi.fn(),
}));

vi.mock('@/config/loader.js', () => ({
  loadConfig: vi.fn(() => ({
    ml: { enabled: true, sidecarUrl: 'http://localhost:8000' },
  })),
}));

// ---------------------------------------------------------------------------
// Source imports — after mocks
// ---------------------------------------------------------------------------

import { registerMarketRoutes } from '@/api/routes/v1/market.js';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('E2E: Market API routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify({ logger: false });
    await server.register(registerMarketRoutes, { prefix: '/v1/market' });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  // -----------------------------------------------------------------------
  // GET /v1/market/price/:symbol
  // -----------------------------------------------------------------------

  describe('GET /v1/market/price/:symbol', () => {
    it('returns price data for a valid symbol', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/market/price/BTC',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.symbol).toBe('BTC');
      expect(body.price).toBe(67850.42);
      expect(body.change24h).toBe(3.21);
      expect(body.volume24h).toBe(28_500_000_000);
      expect(body.marketCap).toBe(1_330_000_000_000);
    });

    it('accepts lowercase symbols', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/market/price/eth',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.symbol).toBe('eth');
    });
  });

  // -----------------------------------------------------------------------
  // GET /v1/market/prices?symbols=BTC,ETH
  // -----------------------------------------------------------------------

  describe('GET /v1/market/prices', () => {
    it('returns batch prices for multiple symbols', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/market/prices?symbols=BTC,ETH',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.prices).toBeDefined();
      expect(body.prices['BTC']).toBeDefined();
      expect(body.prices['ETH']).toBeDefined();
      expect(body.prices['BTC'].price).toBe(67850.42);
    });

    it('handles symbols with whitespace', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/market/prices?symbols=BTC,%20ETH,%20SOL',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.prices).toBeDefined();
      expect(body.prices['BTC']).toBeDefined();
      expect(body.prices['ETH']).toBeDefined();
      expect(body.prices['SOL']).toBeDefined();
    });

    it('returns 400 when symbols query param is missing', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/market/prices',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // GET /v1/market/trending
  // -----------------------------------------------------------------------

  describe('GET /v1/market/trending', () => {
    it('returns trending tokens', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/market/trending',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.tokens).toBeDefined();
      expect(Array.isArray(body.tokens)).toBe(true);
      expect(body.tokens).toHaveLength(3);
      expect(body.tokens[0].symbol).toBe('PEPE');
      expect(body.tokens[0].rank).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // GET /v1/market/fear-greed
  // -----------------------------------------------------------------------

  describe('GET /v1/market/fear-greed', () => {
    it('returns fear & greed index data', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/market/fear-greed',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.value).toBe(72);
      expect(body.classification).toBe('Greed');
      expect(body.previousValue).toBe(68);
    });
  });

  // -----------------------------------------------------------------------
  // GET /v1/market/news
  // -----------------------------------------------------------------------

  describe('GET /v1/market/news', () => {
    it('returns general news articles', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/market/news',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.articles).toBeDefined();
      expect(Array.isArray(body.articles)).toBe(true);
      expect(body.articles).toHaveLength(2);
      expect(body.articles[0].title).toBe('Crypto market rally continues');
    });

    it('returns filtered news when symbol query param is provided', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/market/news?symbol=BTC',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.articles).toBeDefined();
      expect(body.articles).toHaveLength(1);
      expect(body.articles[0].title).toContain('BTC');
    });
  });

  // -----------------------------------------------------------------------
  // GET /v1/market/prediction?symbol=BTC
  // -----------------------------------------------------------------------

  describe('GET /v1/market/prediction', () => {
    it('returns prediction for a valid symbol', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/market/prediction?symbol=BTC',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.symbol).toBe('BTC');
      expect(body.direction).toBe('bullish');
      expect(body.confidence).toBe(0.78);
      expect(body.signals).toBeDefined();
      expect(Array.isArray(body.signals)).toBe(true);
    });

    it('returns 400 when symbol query param is missing', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/market/prediction',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // GET /v1/market/dex/search?q=PEPE
  // -----------------------------------------------------------------------

  describe('GET /v1/market/dex/search', () => {
    it('returns DEX search results', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/market/dex/search?q=PEPE',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.results).toBeDefined();
      expect(Array.isArray(body.results)).toBe(true);
      expect(body.results).toHaveLength(1);
      expect(body.results[0].symbol).toBe('PEPE');
      expect(body.results[0].chain).toBe('ethereum');
    });

    it('returns 400 when q query param is missing', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/market/dex/search',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // GET /v1/market/ml-health
  // -----------------------------------------------------------------------

  describe('GET /v1/market/ml-health', () => {
    it('returns ML sidecar health status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/market/ml-health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.available).toBe(true);
      expect(body.models).toBeDefined();
      expect(Array.isArray(body.models)).toBe(true);
      expect(body.uptime).toBeGreaterThan(0);
      expect(body.predictionsServed).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // GET /v1/market/derivatives/:symbol
  // -----------------------------------------------------------------------

  describe('GET /v1/market/derivatives/:symbol', () => {
    it('returns derivatives/futures data', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/market/derivatives/BTC',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.symbol).toBe('BTC');
      expect(body.fundingRate).toBe(0.0123);
      expect(body.openInterest).toBe(12_500_000_000);
      expect(body.longShortRatio).toBe(1.35);
    });
  });

  // -----------------------------------------------------------------------
  // Error cases
  // -----------------------------------------------------------------------

  describe('Error cases', () => {
    it('returns 404 for unknown market routes', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/market/nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 when POST is sent to GET-only route', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/market/trending',
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for GET on POST-only ML routes', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/market/ml/sentiment',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // POST /v1/market/ml/sentiment
  // -----------------------------------------------------------------------

  describe('POST /v1/market/ml/sentiment', () => {
    it('returns sentiment analysis for valid text', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/market/ml/sentiment',
        payload: { text: 'Bitcoin is going to the moon!' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.sentiment).toBe('positive');
      expect(body.confidence).toBe(0.85);
    });

    it('returns 400 when text is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/market/ml/sentiment',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // POST /v1/market/ml/regime
  // -----------------------------------------------------------------------

  describe('POST /v1/market/ml/regime', () => {
    it('returns regime detection result', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/market/ml/regime',
        payload: {
          returns_1d: 0.02,
          returns_7d: 0.08,
          volatility_14d: 0.15,
          volume_ratio: 1.2,
          rsi: 62,
          bb_width: 0.04,
          fear_greed: 72,
          funding_rate: 0.01,
          price_vs_sma200: 1.1,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.regime).toBe('bullish');
      expect(body.confidence).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // POST /v1/market/ml/trend
  // -----------------------------------------------------------------------

  describe('POST /v1/market/ml/trend', () => {
    it('returns trend scoring result', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/market/ml/trend',
        payload: {
          price_change_24h: 3.5,
          price_change_7d: 12.1,
          volume_24h: 5_000_000_000,
          market_cap: 100_000_000_000,
          volume_to_mcap_ratio: 0.05,
          rank: 5,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.score).toBe(0.81);
      expect(body.direction).toBe('up');
    });
  });
});
