// ---------------------------------------------------------------------------
// Analysis API routes — /v1/analysis/*
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { handleTool } from '../../../ai/tool-handler.js';

export async function registerAnalysisRoutes(server: FastifyInstance): Promise<void> {
  // GET /v1/analysis/batch — run technical + prediction + ML for multiple symbols
  server.get('/batch', {
    schema: {
      tags: ['Analysis'],
      summary: 'Run full analysis (technical + prediction + ML) for multiple symbols',
      querystring: {
        type: 'object',
        properties: {
          symbols: { type: 'string', description: 'Comma-separated symbols (max 20)' },
          timeframe: { type: 'string', default: '4h' },
        },
        required: ['symbols'],
      },
    },
    handler: async (request) => {
      const { symbols, timeframe } = request.query as { symbols: string; timeframe?: string };
      const list = symbols
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 20);

      const results = await Promise.allSettled(
        list.map(async (symbol) => {
          const [technical, prediction, ml] = await Promise.allSettled([
            handleTool('get_technical_analysis', { symbol, timeframe }),
            handleTool('get_prediction', { symbol }),
            handleTool('get_ml_prediction', { symbol }),
          ]);
          return {
            symbol,
            technical: technical.status === 'fulfilled' ? technical.value : null,
            prediction: prediction.status === 'fulfilled' ? prediction.value : null,
            ml: ml.status === 'fulfilled' ? ml.value : null,
          };
        }),
      );

      const successes: Record<string, unknown>[] = [];
      const errors: { symbol: string; error: string }[] = [];
      for (let i = 0; i < results.length; i++) {
        const r = results[i]!;
        if (r.status === 'fulfilled') {
          successes.push(r.value);
        } else {
          errors.push({ symbol: list[i]!, error: r.reason?.message ?? String(r.reason) });
        }
      }

      return { results: successes, errors, total: list.length };
    },
  });

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
