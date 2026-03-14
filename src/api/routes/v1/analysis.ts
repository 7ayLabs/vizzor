// ---------------------------------------------------------------------------
// Analysis API routes — /v1/analysis/*
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { handleTool } from '../../../ai/tool-handler.js';

export async function registerAnalysisRoutes(server: FastifyInstance): Promise<void> {
  server.get('/technical/:symbol', {
    schema: {
      tags: ['Analysis'],
      summary: 'Run technical analysis on a symbol',
      params: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
      querystring: {
        type: 'object',
        properties: { timeframe: { type: 'string', default: '4h' } },
      },
    },
    handler: async (request) => {
      const { symbol } = request.params as { symbol: string };
      const { timeframe } = request.query as { timeframe?: string };
      return handleTool('get_technical_analysis', { symbol, timeframe });
    },
  });

  server.get('/prediction/:symbol', {
    schema: {
      tags: ['Analysis'],
      summary: 'Generate multi-signal composite prediction',
      params: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
    },
    handler: async (request) => {
      const { symbol } = request.params as { symbol: string };
      return handleTool('get_prediction', { symbol });
    },
  });

  server.get('/ml/:symbol', {
    schema: {
      tags: ['Analysis'],
      summary: 'Get ML-enhanced prediction from sidecar models',
      params: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
    },
    handler: async (request) => {
      const { symbol } = request.params as { symbol: string };
      return handleTool('get_ml_prediction', { symbol });
    },
  });

  server.get('/raises/recent', {
    schema: {
      tags: ['Analysis'],
      summary: 'Get recent crypto fundraising rounds',
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          chain: { type: 'string' },
        },
      },
    },
    handler: async (request) => {
      const { category, chain } = request.query as { category?: string; chain?: string };
      return handleTool('get_raises', { category, chain });
    },
  });
}
