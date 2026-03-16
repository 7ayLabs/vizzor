// ---------------------------------------------------------------------------
// E2E tests — Analysis API routes (/v1/analysis/*)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/ai/tool-handler.js', () => ({
  handleTool: vi.fn(async (tool: string, args: Record<string, unknown>) => {
    switch (tool) {
      case 'get_technical_analysis':
        return {
          symbol: args['symbol'],
          timeframe: args['timeframe'] ?? '4h',
          indicators: {
            rsi: 58.4,
            macd: { value: 125.3, signal: 98.7, histogram: 26.6 },
            ema12: 67500,
            ema26: 66800,
            bollingerBands: { upper: 69200, middle: 67000, lower: 64800 },
            atr: 1200,
            obv: 15_800_000,
          },
          summary: 'Bullish momentum with RSI neutral. MACD above signal line.',
          signals: ['MACD bullish', 'Price above EMA12/EMA26', 'RSI neutral zone'],
        };
      case 'get_prediction':
        return {
          symbol: args['symbol'],
          direction: 'bullish',
          confidence: 0.74,
          priceTargets: {
            support: 64500,
            resistance: 71200,
            predicted: 69800,
          },
          signals: [
            'Strong buying volume',
            'Bullish MACD crossover',
            'Fear & Greed in Greed territory',
          ],
          timeframe: '7d',
        };
      case 'get_ml_prediction':
        return {
          symbol: args['symbol'],
          prediction: {
            direction: 'up',
            confidence: 0.82,
            predictedChange: 4.5,
            horizon: '24h',
          },
          modelVersion: '2.1.0',
          features: {
            trend: 0.78,
            momentum: 0.65,
            volatility: 0.42,
          },
        };
      case 'get_raises':
        return {
          raises: [
            {
              project: 'ChainLink Labs',
              amount: 50_000_000,
              round: 'Series B',
              category: 'Oracle',
              chain: 'ethereum',
              date: '2026-03-10',
              investors: ['a16z', 'Paradigm'],
            },
            {
              project: 'LayerZero',
              amount: 120_000_000,
              round: 'Series A',
              category: 'Infrastructure',
              chain: 'multichain',
              date: '2026-03-08',
              investors: ['Sequoia', 'Framework'],
            },
          ],
          totalCount: 2,
          filters: {
            category: args['category'] ?? null,
            chain: args['chain'] ?? null,
          },
        };
      default:
        return {};
    }
  }),
}));

vi.mock('@/api/auth/middleware.js', () => ({
  authMiddleware: vi.fn(async () => {}),
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

// ---------------------------------------------------------------------------
// Source imports
// ---------------------------------------------------------------------------

import { registerAnalysisRoutes } from '@/api/routes/v1/analysis.js';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('E2E: Analysis API routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify({ logger: false });
    await server.register(registerAnalysisRoutes, { prefix: '/v1/analysis' });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  // -----------------------------------------------------------------------
  // GET /v1/analysis/technical/:symbol
  // -----------------------------------------------------------------------

  describe('GET /v1/analysis/technical/:symbol', () => {
    it('returns technical analysis for a valid symbol', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/analysis/technical/BTC',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.symbol).toBe('BTC');
      expect(body.timeframe).toBe('4h');
      expect(body.indicators).toBeDefined();
      expect(body.indicators.rsi).toBe(58.4);
      expect(body.indicators.macd).toBeDefined();
      expect(body.indicators.macd.value).toBe(125.3);
      expect(body.indicators.bollingerBands).toBeDefined();
      expect(body.signals).toBeDefined();
      expect(Array.isArray(body.signals)).toBe(true);
      expect(body.summary).toContain('Bullish');
    });

    it('accepts timeframe query parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/analysis/technical/ETH?timeframe=1d',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.symbol).toBe('ETH');
      expect(body.timeframe).toBe('1d');
    });

    it('uses default 4h timeframe when not specified', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/analysis/technical/SOL',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.timeframe).toBe('4h');
    });
  });

  // -----------------------------------------------------------------------
  // GET /v1/analysis/prediction/:symbol
  // -----------------------------------------------------------------------

  describe('GET /v1/analysis/prediction/:symbol', () => {
    it('returns composite prediction for a valid symbol', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/analysis/prediction/BTC',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.symbol).toBe('BTC');
      expect(body.direction).toBe('bullish');
      expect(body.confidence).toBe(0.74);
      expect(body.priceTargets).toBeDefined();
      expect(body.priceTargets.support).toBe(64500);
      expect(body.priceTargets.resistance).toBe(71200);
      expect(body.signals).toBeDefined();
      expect(Array.isArray(body.signals)).toBe(true);
      expect(body.signals.length).toBeGreaterThan(0);
    });

    it('works with different symbols', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/analysis/prediction/ETH',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.symbol).toBe('ETH');
    });
  });

  // -----------------------------------------------------------------------
  // GET /v1/analysis/ml/:symbol
  // -----------------------------------------------------------------------

  describe('GET /v1/analysis/ml/:symbol', () => {
    it('returns ML-enhanced prediction for a valid symbol', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/analysis/ml/BTC',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.symbol).toBe('BTC');
      expect(body.prediction).toBeDefined();
      expect(body.prediction.direction).toBe('up');
      expect(body.prediction.confidence).toBe(0.82);
      expect(body.prediction.predictedChange).toBe(4.5);
      expect(body.prediction.horizon).toBe('24h');
      expect(body.modelVersion).toBe('2.1.0');
      expect(body.features).toBeDefined();
      expect(body.features.trend).toBe(0.78);
    });

    it('works with lowercase symbols', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/analysis/ml/eth',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.symbol).toBe('eth');
    });
  });

  // -----------------------------------------------------------------------
  // GET /v1/analysis/raises/recent
  // -----------------------------------------------------------------------

  describe('GET /v1/analysis/raises/recent', () => {
    it('returns recent fundraising data', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/analysis/raises/recent',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.raises).toBeDefined();
      expect(Array.isArray(body.raises)).toBe(true);
      expect(body.raises).toHaveLength(2);
      expect(body.raises[0].project).toBe('ChainLink Labs');
      expect(body.raises[0].amount).toBe(50_000_000);
      expect(body.raises[0].investors).toContain('a16z');
      expect(body.totalCount).toBe(2);
    });

    it('passes category filter query param', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/analysis/raises/recent?category=Oracle',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.filters.category).toBe('Oracle');
    });

    it('passes chain filter query param', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/analysis/raises/recent?chain=ethereum',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.filters.chain).toBe('ethereum');
    });

    it('passes both category and chain filters', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/analysis/raises/recent?category=DeFi&chain=polygon',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.filters.category).toBe('DeFi');
      expect(body.filters.chain).toBe('polygon');
    });
  });

  // -----------------------------------------------------------------------
  // Error cases
  // -----------------------------------------------------------------------

  describe('Error cases', () => {
    it('returns 404 for unknown analysis routes', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/analysis/nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 when POST is sent to GET-only routes', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/analysis/technical/BTC',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
