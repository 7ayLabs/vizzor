// ---------------------------------------------------------------------------
// E2E tests — Chat API routes (/v1/chat, /v1/provider)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockProvider = {
  name: 'anthropic',
  supportsTools: true,
  initialize: vi.fn(),
  analyze: vi.fn(async () => 'Mock response'),
  analyzeStream: vi.fn(
    async (
      _systemPrompt: string,
      _userMessage: string,
      callbacks: {
        onText: (delta: string) => void;
        onDone: (fullText: string) => void;
      },
    ) => {
      callbacks.onText('Hello');
      callbacks.onText(', world!');
      callbacks.onDone('Hello, world!');
    },
  ),
};

vi.mock('@/ai/client.js', () => ({
  getProvider: vi.fn(() => mockProvider),
  getConfig: vi.fn(() => ({
    ai: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', maxTokens: 4096 },
    anthropicApiKey: 'test-key',
  })),
  switchProvider: vi.fn((name: string) => {
    mockProvider.name = name;
  }),
}));

vi.mock('@/ai/prompts/chat.js', () => ({
  buildChatSystemPrompt: vi.fn(() => 'You are Vizzor, a crypto assistant.'),
  OLLAMA_SYSTEM_PROMPT: 'You are Vizzor (Ollama mode).',
}));

vi.mock('@/ai/tools.js', () => ({
  VIZZOR_TOOLS: [
    {
      name: 'get_market_data',
      description: 'Get market data',
      input_schema: {
        type: 'object',
        properties: { symbol: { type: 'string' } },
        required: ['symbol'],
      },
    },
  ],
}));

vi.mock('@/ai/tool-handler.js', () => ({
  handleTool: vi.fn(async () => ({ result: 'mock' })),
}));

vi.mock('@/ai/context-injector.js', () => ({
  buildContextBlock: vi.fn(async () => ({ contextText: '', tokenData: [], queriedSymbols: [] })),
}));

vi.mock('@/ai/providers/registry.js', () => ({
  getAvailableProviders: vi.fn(() => [
    { name: 'anthropic', available: true },
    { name: 'openai', available: false, reason: 'OPENAI_API_KEY not set' },
    { name: 'gemini', available: false, reason: 'GOOGLE_API_KEY not set' },
    { name: 'ollama', available: true },
  ]),
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

import { registerChatRoutes } from '@/api/routes/v1/chat.js';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('E2E: Chat API routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify({ logger: false });
    await server.register(registerChatRoutes, { prefix: '/v1' });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  // -----------------------------------------------------------------------
  // GET /v1/provider
  // -----------------------------------------------------------------------

  describe('GET /v1/provider', () => {
    it('returns current provider and available providers', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/provider',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.current).toBeDefined();
      expect(body.providers).toBeDefined();
      expect(Array.isArray(body.providers)).toBe(true);
      expect(body.providers).toHaveLength(4);

      const anthropic = body.providers.find((p: { name: string }) => p.name === 'anthropic');
      expect(anthropic).toBeDefined();
      expect(anthropic.available).toBe(true);

      const openai = body.providers.find((p: { name: string }) => p.name === 'openai');
      expect(openai).toBeDefined();
      expect(openai.available).toBe(false);
      expect(openai.reason).toContain('OPENAI_API_KEY');
    });
  });

  // -----------------------------------------------------------------------
  // PUT /v1/provider
  // -----------------------------------------------------------------------

  describe('PUT /v1/provider', () => {
    it('switches the AI provider', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/v1/provider',
        payload: { provider: 'ollama' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.current).toBeDefined();
      expect(body.message).toContain('Switched');
    });

    it('returns 400 for invalid provider value', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/v1/provider',
        payload: { provider: 'invalid_provider' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when provider field is missing', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/v1/provider',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // POST /v1/chat
  // -----------------------------------------------------------------------

  describe('POST /v1/chat', () => {
    it('returns SSE stream with correct content-type header', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/chat',
        payload: {
          messages: [{ role: 'user', content: 'What is the price of Bitcoin?' }],
        },
      });

      // The route writes directly to reply.raw, so Fastify inject captures
      // the raw response. The status code is set via writeHead.
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
    });

    it('emits SSE events in the response body', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/chat',
        payload: {
          messages: [{ role: 'user', content: 'Hello' }],
        },
      });

      expect(response.statusCode).toBe(200);

      // The body should contain SSE-formatted events
      const body = response.body;
      expect(body).toContain('event: text');
      expect(body).toContain('event: done');
      expect(body).toContain('"delta"');
    });

    it('returns 400 when messages array is empty', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/chat',
        payload: {
          messages: [],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('empty');
    });

    it('returns 400 when messages field is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/chat',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('handles multi-turn conversation with history', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/chat',
        payload: {
          messages: [
            { role: 'user', content: 'What is Bitcoin?' },
            { role: 'assistant', content: 'Bitcoin is a cryptocurrency...' },
            { role: 'user', content: 'What is its price?' },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');
    });

    it('calls analyzeStream on the provider', async () => {
      await server.inject({
        method: 'POST',
        url: '/v1/chat',
        payload: {
          messages: [{ role: 'user', content: 'Test message' }],
        },
      });

      expect(mockProvider.analyzeStream).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Error cases
  // -----------------------------------------------------------------------

  describe('Error cases', () => {
    it('returns 404 for unknown chat routes', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/chat/unknown',
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for GET on POST-only chat route', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/chat',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // SSE stream error handling
  // -----------------------------------------------------------------------

  describe('SSE error handling', () => {
    it('emits error event when provider throws', async () => {
      // Override analyzeStream to throw
      const originalAnalyzeStream = mockProvider.analyzeStream;
      mockProvider.analyzeStream = vi.fn(async () => {
        throw new Error('Provider connection failed');
      });

      const response = await server.inject({
        method: 'POST',
        url: '/v1/chat',
        payload: {
          messages: [{ role: 'user', content: 'This will fail' }],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('event: error');
      expect(response.body).toContain('Provider connection failed');

      // Restore the mock
      mockProvider.analyzeStream = originalAnalyzeStream;
    });
  });
});
