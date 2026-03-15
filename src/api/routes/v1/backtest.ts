// ---------------------------------------------------------------------------
// API: POST /v1/backtest — run a backtest via REST
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { BacktestEngine } from '../../../core/backtest/engine.js';

export async function backtestRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/v1/backtest', async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    const config = {
      strategy: String(body['strategy'] ?? 'momentum'),
      pair: String(body['pair'] ?? 'BTCUSDT'),
      from: String(body['from'] ?? ''),
      to: String(body['to'] ?? ''),
      initialCapital: Number(body['initialCapital'] ?? 10000),
      timeframe: String(body['timeframe'] ?? '4h'),
      slippageBps: Number(body['slippageBps'] ?? 10),
      commissionPct: Number(body['commissionPct'] ?? 0.1),
    };

    if (!config.from || !config.to) {
      return reply.status(400).send({ error: 'from and to dates are required' });
    }

    const engine = new BacktestEngine(config);
    const result = await engine.run();
    return result;
  });
}
