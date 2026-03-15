// ---------------------------------------------------------------------------
// API: /v1/agents — Agent CRUD and control
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import {
  createAgent,
  listAgents,
  getAgentByName,
  getAgentStatus,
  startAgent,
  stopAgent,
  deleteAgent as removeAgent,
} from '../../../core/agent/index.js';

const limiter = new RateLimiterMemory({ points: 100, duration: 60 });

export async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      await limiter.consume(request.ip);
    } catch {
      reply.status(429).send({ error: 'Too Many Requests' });
    }
  });

  fastify.get('/v1/agents', async () => {
    const agents = listAgents();
    return {
      agents: agents.map((a) => {
        const status = getAgentStatus(a.id);
        return {
          name: a.name,
          strategy: a.strategy,
          pairs: a.pairs,
          interval: a.interval,
          status: status?.status ?? 'idle',
          cycleCount: status?.cycleCount ?? 0,
        };
      }),
    };
  });

  fastify.post('/v1/agents', async (request) => {
    const body = request.body as Record<string, unknown>;
    const name = String(body['name'] ?? '');
    const strategy = String(body['strategy'] ?? 'momentum');
    const pairs = (body['pairs'] as string[]) ?? ['BTC', 'ETH'];
    const interval = Number(body['interval'] ?? 60);
    const agent = createAgent(name, strategy, pairs, interval);
    return { id: agent.id, name: agent.name, strategy: agent.strategy, pairs: agent.pairs };
  });

  fastify.get('/v1/agents/:name', async (request) => {
    const { name } = request.params as { name: string };
    const agent = getAgentByName(name);
    if (!agent) return { error: 'Agent not found' };
    const status = getAgentStatus(agent.id);
    return {
      name: agent.name,
      strategy: agent.strategy,
      pairs: agent.pairs,
      status: status?.status ?? 'idle',
      cycleCount: status?.cycleCount ?? 0,
    };
  });

  fastify.post('/v1/agents/:name/start', async (request) => {
    const { name } = request.params as { name: string };
    const agent = getAgentByName(name);
    if (!agent) return { error: 'Agent not found' };
    startAgent(agent.id);
    return { message: `Agent "${name}" started` };
  });

  fastify.post('/v1/agents/:name/stop', async (request) => {
    const { name } = request.params as { name: string };
    const agent = getAgentByName(name);
    if (!agent) return { error: 'Agent not found' };
    stopAgent(agent.id);
    return { message: `Agent "${name}" stopped` };
  });

  fastify.delete('/v1/agents/:name', async (request) => {
    const { name } = request.params as { name: string };
    const agent = getAgentByName(name);
    if (!agent) return { error: 'Agent not found' };
    removeAgent(agent.id);
    return { message: `Agent "${name}" deleted` };
  });
}
