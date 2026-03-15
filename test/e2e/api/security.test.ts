// ---------------------------------------------------------------------------
// E2E tests — Security API routes (/v1/security/*)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/ai/tool-handler.js', () => ({
  handleTool: vi.fn(async (tool: string, args: Record<string, unknown>) => {
    switch (tool) {
      case 'get_token_security': {
        const chain = (args['chain'] as string) ?? 'ethereum';
        if (chain !== 'ethereum' && chain !== 'bsc' && chain !== 'polygon') {
          throw new Error(`Unsupported chain: ${chain}`);
        }
        return {
          address: args['address'],
          chain,
          isOpenSource: true,
          isProxy: false,
          isMintable: false,
          isHoneypot: false,
          buyTax: 0,
          sellTax: 0,
          holderCount: 42000,
          lpLocked: true,
          ownershipRenounced: true,
          riskLevel: 'low',
        };
      }
      case 'check_rug_indicators':
        return {
          address: args['address'],
          chain: args['chain'] ?? 'ethereum',
          rugScore: 12,
          indicators: {
            liquidityLocked: true,
            ownershipRenounced: true,
            honeypot: false,
            highTax: false,
            topHolderConcentration: 8.5,
          },
          verdict: 'LOW_RISK',
        };
      case 'analyze_wallet':
        return {
          address: args['address'],
          chain: args['chain'] ?? 'ethereum',
          balance: '12.45',
          transactionCount: 847,
          firstSeen: '2021-06-15T00:00:00Z',
          lastActive: '2026-03-14T10:00:00Z',
          labels: ['active_trader'],
          riskScore: 15,
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

import { registerSecurityRoutes } from '@/api/routes/v1/security.js';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('E2E: Security API routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify({ logger: false });
    await server.register(registerSecurityRoutes, { prefix: '/v1/security' });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  // -----------------------------------------------------------------------
  // POST /v1/security/token
  // -----------------------------------------------------------------------

  describe('POST /v1/security/token', () => {
    it('returns token security data for a valid address', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/security/token',
        payload: {
          address: '0x6982508145454ce325ddbe47a25d4ec3d2311933',
          chain: 'ethereum',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.address).toBe('0x6982508145454ce325ddbe47a25d4ec3d2311933');
      expect(body.chain).toBe('ethereum');
      expect(body.isOpenSource).toBe(true);
      expect(body.isHoneypot).toBe(false);
      expect(body.riskLevel).toBe('low');
      expect(body.holderCount).toBe(42000);
      expect(body.lpLocked).toBe(true);
    });

    it('defaults chain to ethereum when not provided', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/security/token',
        payload: {
          address: '0xdead0000000000000000000000000000deadbeef',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.chain).toBe('ethereum');
    });

    it('returns 400 when address is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/security/token',
        payload: { chain: 'ethereum' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 500 for invalid/unsupported chain', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/security/token',
        payload: {
          address: '0x6982508145454ce325ddbe47a25d4ec3d2311933',
          chain: 'invalid_chain',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // POST /v1/security/rug-check
  // -----------------------------------------------------------------------

  describe('POST /v1/security/rug-check', () => {
    it('returns rug pull indicators for a valid address', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/security/rug-check',
        payload: {
          address: '0x6982508145454ce325ddbe47a25d4ec3d2311933',
          chain: 'ethereum',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.address).toBe('0x6982508145454ce325ddbe47a25d4ec3d2311933');
      expect(body.rugScore).toBe(12);
      expect(body.verdict).toBe('LOW_RISK');
      expect(body.indicators).toBeDefined();
      expect(body.indicators.liquidityLocked).toBe(true);
      expect(body.indicators.honeypot).toBe(false);
    });

    it('returns 400 when address is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/security/rug-check',
        payload: { chain: 'bsc' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('defaults chain to ethereum', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/security/rug-check',
        payload: {
          address: '0xabcdef1234567890abcdef1234567890abcdef12',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.chain).toBe('ethereum');
    });
  });

  // -----------------------------------------------------------------------
  // POST /v1/security/wallet
  // -----------------------------------------------------------------------

  describe('POST /v1/security/wallet', () => {
    it('returns wallet analysis for a valid address', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/security/wallet',
        payload: {
          address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          chain: 'ethereum',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.address).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
      expect(body.chain).toBe('ethereum');
      expect(body.balance).toBe('12.45');
      expect(body.transactionCount).toBe(847);
      expect(body.labels).toContain('active_trader');
      expect(body.riskScore).toBe(15);
    });

    it('returns 400 when address is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/security/wallet',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('accepts alternative chains', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/security/wallet',
        payload: {
          address: '0xabcdef1234567890abcdef1234567890abcdef12',
          chain: 'bsc',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.chain).toBe('bsc');
    });
  });

  // -----------------------------------------------------------------------
  // Error cases
  // -----------------------------------------------------------------------

  describe('Error cases', () => {
    it('returns 404 for GET on POST-only security routes', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/security/token',
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for unknown security routes', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/security/unknown-endpoint',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
