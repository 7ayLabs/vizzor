import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Mock the database used by keys.ts and middleware.ts
// ---------------------------------------------------------------------------

const VALID_KEY_HASH = 'a'.repeat(128); // mock 64-byte hex hash

// Test-only dummy values — NOT real credentials
const TEST_VALID_KEY = `test_${'x'.repeat(20)}`;
const TEST_INVALID_KEY = `test_${'y'.repeat(20)}`;

const mockAll = vi.fn(() => [{ key_hash: VALID_KEY_HASH }]);
const mockPrepare = vi.fn(() => ({
  run: vi.fn(() => ({ changes: 0 })),
  all: mockAll,
  get: vi.fn(),
}));
const mockExec = vi.fn();

vi.mock('@/data/cache.js', () => ({
  getDb: () => ({
    exec: mockExec,
    prepare: mockPrepare,
    all: mockAll,
  }),
}));

// Mock hashApiKey to return our known hash for the "valid" key
vi.mock('@/api/auth/keys.js', () => ({
  hashApiKey: vi.fn((key: string) => {
    if (key === TEST_VALID_KEY) return VALID_KEY_HASH;
    return 'b'.repeat(128); // invalid hash
  }),
}));

import { authMiddleware } from '@/api/auth/middleware.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: return a valid key in the DB
  mockAll.mockReturnValue([{ key_hash: VALID_KEY_HASH }]);
});

describe('authMiddleware', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify({ logger: false });

    // Register the real middleware as a hook
    server.addHook('onRequest', authMiddleware);

    // Public endpoints
    server.get('/health', async () => ({ status: 'ok' }));
    server.get('/docs', async () => ({ docs: true }));
    server.get('/docs/openapi.json', async () => ({ openapi: '3.0' }));

    // Protected endpoints
    server.get('/v1/market/price', async () => ({ price: 42000 }));
    server.get('/v1/scan', async () => ({ scan: 'data' }));

    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  // -------------------------------------------------------------------------
  // Public paths
  // -------------------------------------------------------------------------

  it('allows requests to /health without API key', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
  });

  it('allows requests to /docs without API key in non-production', async () => {
    const origEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'development';

    const response = await server.inject({
      method: 'GET',
      url: '/docs',
    });

    expect(response.statusCode).toBe(200);
    process.env['NODE_ENV'] = origEnv;
  });

  it('allows requests to /docs sub-paths without API key in non-production', async () => {
    const origEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'development';

    const response = await server.inject({
      method: 'GET',
      url: '/docs/openapi.json',
    });

    expect(response.statusCode).toBe(200);
    process.env['NODE_ENV'] = origEnv;
  });

  it('returns 404 for /docs in production', async () => {
    const origEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';

    const response = await server.inject({
      method: 'GET',
      url: '/docs',
    });

    expect(response.statusCode).toBe(404);
    process.env['NODE_ENV'] = origEnv;
  });

  // -------------------------------------------------------------------------
  // Missing API key
  // -------------------------------------------------------------------------

  it('returns 401 when X-API-Key header is missing', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/market/price',
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Unauthorized');
    expect(body.message).toContain('X-API-Key');
  });

  it('returns 401 when X-API-Key is empty string', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/market/price',
      headers: { 'x-api-key': '' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 401 when X-API-Key exceeds 256 characters', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/market/price',
      headers: { 'x-api-key': 'x'.repeat(257) },
    });

    expect(response.statusCode).toBe(401);
  });

  // -------------------------------------------------------------------------
  // Invalid API key
  // -------------------------------------------------------------------------

  it('returns 403 when API key is invalid', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/market/price',
      headers: { 'x-api-key': TEST_INVALID_KEY },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Forbidden');
    expect(body.message).toContain('Invalid API key');
  });

  // -------------------------------------------------------------------------
  // Valid API key
  // -------------------------------------------------------------------------

  it('passes through with a valid API key', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/market/price',
      headers: { 'x-api-key': TEST_VALID_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.price).toBe(42000);
  });

  it('passes through for multiple protected routes with valid key', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/scan',
      headers: { 'x-api-key': TEST_VALID_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.scan).toBe('data');
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it('returns 403 when no keys exist in the database', async () => {
    mockAll.mockReturnValue([]);

    const response = await server.inject({
      method: 'GET',
      url: '/v1/market/price',
      headers: { 'x-api-key': TEST_VALID_KEY },
    });

    expect(response.statusCode).toBe(403);
  });

  it('returns 403 when database throws', async () => {
    mockPrepare.mockImplementationOnce(() => {
      throw new Error('DB locked');
    });

    const response = await server.inject({
      method: 'GET',
      url: '/v1/market/price',
      headers: { 'x-api-key': TEST_VALID_KEY },
    });

    expect(response.statusCode).toBe(403);
  });
});
