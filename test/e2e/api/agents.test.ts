// ---------------------------------------------------------------------------
// E2E tests — Agents API routes (/v1/agents/*)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// In-memory agent store to simulate CRUD across requests
// ---------------------------------------------------------------------------

interface MockAgent {
  id: string;
  name: string;
  strategy: string;
  pairs: string[];
  interval: number;
  createdAt: number;
  updatedAt: number;
}

const agents = new Map<string, MockAgent>();
const runningAgents = new Set<string>();
let idCounter = 0;

function resetAgentStore(): void {
  agents.clear();
  runningAgents.clear();
  idCounter = 0;
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/core/agent/index.js', () => ({
  createAgent: vi.fn((name: string, strategy: string, pairs: string[], interval: number) => {
    // Check for duplicate
    for (const a of agents.values()) {
      if (a.name === name) {
        throw new Error(
          `Agent "${name}" already exists. Delete it first or choose a different name.`,
        );
      }
    }
    idCounter++;
    const id = `agent-${idCounter}`;
    const now = Date.now();
    const agent: MockAgent = {
      id,
      name,
      strategy,
      pairs,
      interval,
      createdAt: now,
      updatedAt: now,
    };
    agents.set(id, agent);
    return agent;
  }),

  listAgents: vi.fn(() => Array.from(agents.values())),

  getAgentByName: vi.fn((name: string) => {
    for (const a of agents.values()) {
      if (a.name === name) return a;
    }
    return null;
  }),

  getAgentStatus: vi.fn((id: string) => {
    const agent = agents.get(id);
    if (!agent) return null;
    return {
      status: runningAgents.has(id) ? 'running' : 'idle',
      cycleCount: runningAgents.has(id) ? 5 : 0,
    };
  }),

  startAgent: vi.fn((id: string) => {
    if (!agents.has(id)) throw new Error(`Agent not found: ${id}`);
    runningAgents.add(id);
  }),

  stopAgent: vi.fn((id: string) => {
    if (!agents.has(id)) throw new Error(`Agent not found: ${id}`);
    runningAgents.delete(id);
  }),

  deleteAgent: vi.fn((id: string) => {
    runningAgents.delete(id);
    return agents.delete(id);
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

import { agentRoutes } from '@/api/routes/v1/agents.js';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('E2E: Agents API routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify({ logger: false });
    await server.register(agentRoutes);
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    resetAgentStore();
  });

  // -----------------------------------------------------------------------
  // POST /v1/agents — create agent
  // -----------------------------------------------------------------------

  describe('POST /v1/agents', () => {
    it('creates a new agent', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/agents',
        payload: {
          name: 'test-bot',
          strategy: 'momentum',
          pairs: ['BTC', 'ETH'],
          interval: 120,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.name).toBe('test-bot');
      expect(body.strategy).toBe('momentum');
      expect(body.pairs).toEqual(['BTC', 'ETH']);
    });

    it('creates an agent with default values when optional fields are omitted', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/agents',
        payload: {
          name: 'minimal-bot',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('minimal-bot');
      expect(body.strategy).toBe('momentum');
    });

    it('returns 500 when creating a duplicate agent', async () => {
      // First creation
      await server.inject({
        method: 'POST',
        url: '/v1/agents',
        payload: {
          name: 'dup-bot',
          strategy: 'momentum',
          pairs: ['BTC'],
          interval: 60,
        },
      });

      // Duplicate creation
      const response = await server.inject({
        method: 'POST',
        url: '/v1/agents',
        payload: {
          name: 'dup-bot',
          strategy: 'momentum',
          pairs: ['ETH'],
          interval: 60,
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // GET /v1/agents — list agents
  // -----------------------------------------------------------------------

  describe('GET /v1/agents', () => {
    it('returns empty list when no agents exist', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/agents',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.agents).toBeDefined();
      expect(Array.isArray(body.agents)).toBe(true);
      expect(body.agents).toHaveLength(0);
    });

    it('returns all created agents', async () => {
      // Create two agents
      await server.inject({
        method: 'POST',
        url: '/v1/agents',
        payload: { name: 'bot-a', strategy: 'momentum', pairs: ['BTC'], interval: 60 },
      });
      await server.inject({
        method: 'POST',
        url: '/v1/agents',
        payload: { name: 'bot-b', strategy: 'momentum', pairs: ['ETH'], interval: 120 },
      });

      const response = await server.inject({
        method: 'GET',
        url: '/v1/agents',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.agents).toHaveLength(2);

      const names = body.agents.map((a: { name: string }) => a.name);
      expect(names).toContain('bot-a');
      expect(names).toContain('bot-b');
    });

    it('includes status and cycleCount for each agent', async () => {
      await server.inject({
        method: 'POST',
        url: '/v1/agents',
        payload: { name: 'status-bot', strategy: 'momentum', pairs: ['BTC'], interval: 60 },
      });

      const response = await server.inject({
        method: 'GET',
        url: '/v1/agents',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.agents[0].status).toBe('idle');
      expect(body.agents[0].cycleCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // GET /v1/agents/:name — get single agent
  // -----------------------------------------------------------------------

  describe('GET /v1/agents/:name', () => {
    it('returns agent details by name', async () => {
      await server.inject({
        method: 'POST',
        url: '/v1/agents',
        payload: { name: 'named-bot', strategy: 'momentum', pairs: ['SOL'], interval: 30 },
      });

      const response = await server.inject({
        method: 'GET',
        url: '/v1/agents/named-bot',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('named-bot');
      expect(body.strategy).toBe('momentum');
      expect(body.pairs).toEqual(['SOL']);
      expect(body.status).toBe('idle');
    });

    it('returns error for non-existent agent', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/agents/ghost-bot',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Agent not found');
    });
  });

  // -----------------------------------------------------------------------
  // POST /v1/agents/:name/start — start agent
  // -----------------------------------------------------------------------

  describe('POST /v1/agents/:name/start', () => {
    it('starts an existing agent', async () => {
      await server.inject({
        method: 'POST',
        url: '/v1/agents',
        payload: { name: 'start-bot', strategy: 'momentum', pairs: ['BTC'], interval: 60 },
      });

      const response = await server.inject({
        method: 'POST',
        url: '/v1/agents/start-bot/start',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('started');
      expect(body.message).toContain('start-bot');
    });

    it('returns error when starting non-existent agent', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/agents/ghost-bot/start',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Agent not found');
    });
  });

  // -----------------------------------------------------------------------
  // POST /v1/agents/:name/stop — stop agent
  // -----------------------------------------------------------------------

  describe('POST /v1/agents/:name/stop', () => {
    it('stops a running agent', async () => {
      await server.inject({
        method: 'POST',
        url: '/v1/agents',
        payload: { name: 'stop-bot', strategy: 'momentum', pairs: ['BTC'], interval: 60 },
      });

      // Start it first
      await server.inject({
        method: 'POST',
        url: '/v1/agents/stop-bot/start',
      });

      // Then stop it
      const response = await server.inject({
        method: 'POST',
        url: '/v1/agents/stop-bot/stop',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('stopped');
      expect(body.message).toContain('stop-bot');
    });

    it('returns error when stopping non-existent agent', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/agents/ghost-bot/stop',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Agent not found');
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /v1/agents/:name — delete agent
  // -----------------------------------------------------------------------

  describe('DELETE /v1/agents/:name', () => {
    it('deletes an existing agent', async () => {
      await server.inject({
        method: 'POST',
        url: '/v1/agents',
        payload: { name: 'delete-bot', strategy: 'momentum', pairs: ['BTC'], interval: 60 },
      });

      const response = await server.inject({
        method: 'DELETE',
        url: '/v1/agents/delete-bot',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('deleted');
      expect(body.message).toContain('delete-bot');

      // Verify it is gone
      const getResponse = await server.inject({
        method: 'GET',
        url: '/v1/agents/delete-bot',
      });

      const getBody = JSON.parse(getResponse.body);
      expect(getBody.error).toBe('Agent not found');
    });

    it('returns error when deleting non-existent agent', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/v1/agents/ghost-bot',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Agent not found');
    });
  });

  // -----------------------------------------------------------------------
  // Full lifecycle: create -> start -> stop -> delete
  // -----------------------------------------------------------------------

  describe('Agent lifecycle', () => {
    it('supports the full create -> start -> stop -> delete cycle', async () => {
      // Create
      const createRes = await server.inject({
        method: 'POST',
        url: '/v1/agents',
        payload: {
          name: 'lifecycle-bot',
          strategy: 'momentum',
          pairs: ['BTC', 'ETH'],
          interval: 60,
        },
      });
      expect(createRes.statusCode).toBe(200);
      const created = JSON.parse(createRes.body);
      expect(created.name).toBe('lifecycle-bot');

      // List and verify
      const listRes = await server.inject({ method: 'GET', url: '/v1/agents' });
      const listed = JSON.parse(listRes.body);
      expect(listed.agents).toHaveLength(1);

      // Start
      const startRes = await server.inject({
        method: 'POST',
        url: '/v1/agents/lifecycle-bot/start',
      });
      expect(startRes.statusCode).toBe(200);
      expect(JSON.parse(startRes.body).message).toContain('started');

      // Check running status
      const statusRes = await server.inject({
        method: 'GET',
        url: '/v1/agents/lifecycle-bot',
      });
      const status = JSON.parse(statusRes.body);
      expect(status.status).toBe('running');
      expect(status.cycleCount).toBe(5);

      // Stop
      const stopRes = await server.inject({
        method: 'POST',
        url: '/v1/agents/lifecycle-bot/stop',
      });
      expect(stopRes.statusCode).toBe(200);
      expect(JSON.parse(stopRes.body).message).toContain('stopped');

      // Delete
      const deleteRes = await server.inject({
        method: 'DELETE',
        url: '/v1/agents/lifecycle-bot',
      });
      expect(deleteRes.statusCode).toBe(200);
      expect(JSON.parse(deleteRes.body).message).toContain('deleted');

      // Verify empty list
      const emptyRes = await server.inject({ method: 'GET', url: '/v1/agents' });
      expect(JSON.parse(emptyRes.body).agents).toHaveLength(0);
    });
  });
});
