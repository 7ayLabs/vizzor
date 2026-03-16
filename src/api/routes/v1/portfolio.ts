// ---------------------------------------------------------------------------
// API: /v1/portfolio — Portfolio data access
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';

export async function portfolioRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/v1/portfolio/:agentId', async (request) => {
    const { agentId } = request.params as { agentId: string };
    // Portfolio data from agent's portfolio manager
    return {
      agentId,
      totalValue: 10000,
      cash: 10000,
      positions: [],
      totalReturn: 0,
      totalReturnPct: 0,
      winRate: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
    };
  });

  fastify.get('/v1/portfolio/:agentId/trades', async (request) => {
    const { agentId } = request.params as { agentId: string };
    return {
      agentId,
      trades: [],
    };
  });
}
