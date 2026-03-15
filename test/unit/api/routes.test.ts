import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// Mock the tool handler to avoid real API calls
vi.mock('@/ai/tool-handler.js', () => ({
  handleTool: vi.fn(async (tool: string, args: Record<string, unknown>) => {
    if (tool === 'get_market_data') {
      return {
        symbol: args['symbol'],
        price: 42000,
        change24h: 2.5,
        volume24h: 1_000_000_000,
      };
    }
    if (tool === 'get_trending') {
      return { tokens: [{ symbol: 'BTC', rank: 1 }] };
    }
    if (tool === 'get_fear_greed') {
      return { value: 65, classification: 'Greed' };
    }
    if (tool === 'get_crypto_news') {
      return { articles: [] };
    }
    if (tool === 'search_token_dex') {
      return { results: [] };
    }
    if (tool === 'get_derivatives_data') {
      return { fundingRate: 0.01, openInterest: 1000000 };
    }
    return {};
  }),
}));

// Mock auth middleware to skip authentication in tests
vi.mock('@/api/auth/middleware.js', () => ({
  authMiddleware: vi.fn(async () => {
    // No-op: allow all requests through
  }),
}));

// Mock the database
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

// Mock error handler
vi.mock('@/api/middleware/error-handler.js', () => ({
  errorHandler: vi.fn(
    (
      error: unknown,
      _request: unknown,
      reply: { status: (n: number) => { send: (o: unknown) => void } },
    ) => {
      reply.status(500).send({ error: 'Internal Server Error' });
    },
  ),
}));

import { registerMarketRoutes } from '@/api/routes/v1/market.js';

describe('API Routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify({ logger: false });
    await server.register(registerMarketRoutes, { prefix: '/v1/market' });

    // Add a health endpoint like the real server
    server.get('/health', async () => ({
      status: 'ok',
      version: '0.10.5',
    }));

    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('GET /health returns ok status', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
  });

  it('GET /v1/market/price/:symbol returns price data', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/market/price/BTC',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.symbol).toBe('BTC');
    expect(body.price).toBe(42000);
  });

  it('GET /v1/market/trending returns trending tokens', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/market/trending',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.tokens).toBeDefined();
  });

  it('GET /v1/market/fear-greed returns index data', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/market/fear-greed',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.value).toBe(65);
    expect(body.classification).toBe('Greed');
  });

  it('GET /v1/market/news returns news articles', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/market/news',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.articles).toBeDefined();
  });

  it('GET /v1/market/news?symbol=BTC passes symbol query param', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/market/news?symbol=BTC',
    });
    expect(response.statusCode).toBe(200);
  });

  it('GET /v1/market/dex/search?q=token returns results', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/market/dex/search?q=token',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.results).toBeDefined();
  });

  it('GET /v1/market/derivatives/:symbol returns data', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/market/derivatives/BTC',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.fundingRate).toBe(0.01);
  });

  it('returns 404 for unknown routes', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/market/unknown',
    });
    expect(response.statusCode).toBe(404);
  });

  it('POST to GET-only route returns 404', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/market/trending',
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('API Auth Rejection', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify({ logger: false });

    // Simulate auth middleware that rejects requests without API key
    server.addHook('onRequest', async (request, reply) => {
      if (request.url === '/health') return;
      const key = request.headers['x-api-key'];
      if (!key) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
    });

    server.get('/health', async () => ({ status: 'ok' }));
    server.get('/v1/protected', async () => ({ data: 'secret' }));

    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('health endpoint is accessible without auth', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.statusCode).toBe(200);
  });

  it('protected endpoint rejects without API key', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/protected',
    });
    expect(response.statusCode).toBe(401);
  });

  it('protected endpoint allows with API key', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/protected',
      headers: { 'x-api-key': 'test-key' },
    });
    expect(response.statusCode).toBe(200);
  });
});
