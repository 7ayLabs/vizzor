// ---------------------------------------------------------------------------
// API: /v1/agents — Agent CRUD and control
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import {
  createAgent,
  listAgents,
  getAgentByName,
  getAgentStatus,
  startAgent,
  stopAgent,
  deleteAgent as removeAgent,
} from '../../../core/agent/index.js';

export async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  const readRateLimit = fastify.rateLimit({ max: 100, timeWindow: '1 minute' });
  const writeRateLimit = fastify.rateLimit({ max: 20, timeWindow: '1 minute' });

  fastify.get('/v1/agents', { preHandler: readRateLimit }, async () => {
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

  fastify.post('/v1/agents', { preHandler: writeRateLimit }, async (request) => {
    const body = request.body as Record<string, unknown>;
    const name = String(body['name'] ?? '');
    const strategy = String(body['strategy'] ?? 'momentum');
    const pairs = (body['pairs'] as string[]) ?? ['BTC', 'ETH'];
    const interval = Number(body['interval'] ?? 60);
    const agent = createAgent(name, strategy, pairs, interval);
    return { id: agent.id, name: agent.name, strategy: agent.strategy, pairs: agent.pairs };
  });

  fastify.get('/v1/agents/:name', { preHandler: readRateLimit }, async (request) => {
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

  fastify.post('/v1/agents/:name/start', { preHandler: writeRateLimit }, async (request) => {
    const { name } = request.params as { name: string };
    const agent = getAgentByName(name);
    if (!agent) return { error: 'Agent not found' };
    startAgent(agent.id);
    return { message: `Agent "${name}" started` };
  });

  fastify.post('/v1/agents/:name/stop', { preHandler: writeRateLimit }, async (request) => {
    const { name } = request.params as { name: string };
    const agent = getAgentByName(name);
    if (!agent) return { error: 'Agent not found' };
    stopAgent(agent.id);
    return { message: `Agent "${name}" stopped` };
  });

  fastify.delete('/v1/agents/:name', { preHandler: writeRateLimit }, async (request) => {
    const { name } = request.params as { name: string };
    const agent = getAgentByName(name);
    if (!agent) return { error: 'Agent not found' };
    removeAgent(agent.id);
    return { message: `Agent "${name}" deleted` };
  });
}
