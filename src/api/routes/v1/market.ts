// ---------------------------------------------------------------------------
// Market data API routes — /v1/market/*
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { handleTool } from '../../../ai/tool-handler.js';

export async function registerMarketRoutes(server: FastifyInstance): Promise<void> {
  server.get('/price/:symbol', {
    schema: {
      tags: ['Market'],
      summary: 'Get live price and market data for a symbol',
      params: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
    },
    handler: async (request) => {
      const { symbol } = request.params as { symbol: string };
      return handleTool('get_market_data', { symbol });
    },
  });

  server.get('/trending', {
    schema: {
      tags: ['Market'],
      summary: 'Get trending tokens from DEX and CoinGecko',
    },
    handler: async () => {
      return handleTool('get_trending', {});
    },
  });

  server.get('/fear-greed', {
    schema: {
      tags: ['Market'],
      summary: 'Get Crypto Fear & Greed Index with history',
    },
    handler: async () => {
      return handleTool('get_fear_greed', {});
    },
  });

  server.get('/news', {
    schema: {
      tags: ['Market'],
      summary: 'Get latest crypto news with sentiment',
      querystring: {
        type: 'object',
        properties: { symbol: { type: 'string' } },
      },
    },
    handler: async (request) => {
      const { symbol } = request.query as { symbol?: string };
      return handleTool('get_crypto_news', { symbol });
    },
  });

  server.get('/dex/search', {
    schema: {
      tags: ['Market'],
      summary: 'Search tokens on decentralized exchanges',
      querystring: {
        type: 'object',
        properties: { q: { type: 'string' } },
        required: ['q'],
      },
    },
    handler: async (request) => {
      const { q } = request.query as { q: string };
      return handleTool('search_token_dex', { query: q });
    },
  });

  server.get('/derivatives/:symbol', {
    schema: {
      tags: ['Market'],
      summary: 'Get derivatives data (funding rate, open interest)',
      params: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
    },
    handler: async (request) => {
      const { symbol } = request.params as { symbol: string };
      return handleTool('get_derivatives_data', { symbol });
    },
  });
}
