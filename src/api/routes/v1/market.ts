// ---------------------------------------------------------------------------
// Market data API routes — /v1/market/*
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { handleTool } from '../../../ai/tool-handler.js';
import { getMLClient, initMLClient } from '../../../ml/client.js';
import { loadConfig } from '../../../config/loader.js';

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

  server.get('/prices', {
    schema: {
      tags: ['Market'],
      summary: 'Get prices for multiple symbols in one call',
      querystring: {
        type: 'object',
        properties: { symbols: { type: 'string', description: 'Comma-separated symbols' } },
        required: ['symbols'],
      },
    },
    handler: async (request) => {
      const { symbols } = request.query as { symbols: string };
      const list = symbols
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 100);
      const results = await Promise.allSettled(
        list.map((symbol) =>
          handleTool('get_market_data', { symbol }).then((data) => ({ symbol, ...data })),
        ),
      );
      const prices: Record<string, unknown> = {};
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          const { symbol, ...rest } = r.value as { symbol: string } & Record<string, unknown>;
          prices[symbol] = rest;
        }
      }
      return { prices };
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
      try {
        const { symbol } = request.query as { symbol?: string };
        return await handleTool('get_crypto_news', { symbol });
      } catch {
        return { news: [] };
      }
    },
  });

  server.get('/prediction', {
    schema: {
      tags: ['Market'],
      summary: 'Get AI prediction for a symbol',
      querystring: {
        type: 'object',
        properties: { symbol: { type: 'string' } },
        required: ['symbol'],
      },
    },
    handler: async (request) => {
      const { symbol } = request.query as { symbol: string };
      return handleTool('get_prediction', { symbol });
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

  server.get('/ml-health', {
    schema: {
      tags: ['Market'],
      summary: 'Get ML sidecar health and model status',
    },
    handler: async () => {
      let mlClient = getMLClient();
      if (!mlClient) {
        const cfg = loadConfig();
        if (cfg.ml?.enabled && cfg.ml.sidecarUrl) {
          mlClient = initMLClient(cfg.ml.sidecarUrl);
        }
      }
      if (!mlClient) {
        return { available: false, models: [], uptime: 0, predictionsServed: 0 };
      }
      const health = await mlClient.getModelHealth();
      if (!health) {
        return { available: false, models: [], uptime: 0, predictionsServed: 0 };
      }
      return { available: true, ...health };
    },
  });

  server.post('/ml/sentiment', {
    schema: {
      tags: ['Market'],
      summary: 'Analyze text sentiment via ML',
      body: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
    },
    handler: async (request) => {
      const { text } = request.body as { text: string };
      let mlClient = getMLClient();
      if (!mlClient) {
        const cfg = loadConfig();
        if (cfg.ml?.enabled && cfg.ml.sidecarUrl) {
          mlClient = initMLClient(cfg.ml.sidecarUrl);
        }
      }
      if (!mlClient) return { error: 'ML sidecar unavailable' };
      const result = await mlClient.analyzeSentiment(text);
      return result ?? { error: 'Sentiment analysis failed' };
    },
  });

  server.post('/ml/regime', {
    schema: {
      tags: ['Market'],
      summary: 'Detect market regime via ML',
      body: {
        type: 'object',
        properties: {
          returns_1d: { type: 'number' },
          returns_7d: { type: 'number' },
          volatility_14d: { type: 'number' },
          volume_ratio: { type: 'number' },
          rsi: { type: 'number' },
          bb_width: { type: 'number' },
          fear_greed: { type: 'number' },
          funding_rate: { type: 'number' },
          price_vs_sma200: { type: 'number' },
        },
      },
    },
    handler: async (request) => {
      const features = request.body as Record<string, number>;
      let mlClient = getMLClient();
      if (!mlClient) {
        const cfg = loadConfig();
        if (cfg.ml?.enabled && cfg.ml.sidecarUrl) {
          mlClient = initMLClient(cfg.ml.sidecarUrl);
        }
      }
      if (!mlClient) return { error: 'ML sidecar unavailable' };
      const result = await mlClient.detectRegime(features as never);
      return result ?? { error: 'Regime detection failed' };
    },
  });

  server.post('/ml/trend', {
    schema: {
      tags: ['Market'],
      summary: 'Score trend via ML',
      body: {
        type: 'object',
        properties: {
          price_change_24h: { type: 'number' },
          price_change_7d: { type: 'number' },
          volume_24h: { type: 'number' },
          market_cap: { type: 'number' },
          volume_to_mcap_ratio: { type: 'number' },
          rank: { type: 'number' },
        },
      },
    },
    handler: async (request) => {
      const features = request.body as Record<string, number>;
      let mlClient = getMLClient();
      if (!mlClient) {
        const cfg = loadConfig();
        if (cfg.ml?.enabled && cfg.ml.sidecarUrl) {
          mlClient = initMLClient(cfg.ml.sidecarUrl);
        }
      }
      if (!mlClient) return { error: 'ML sidecar unavailable' };
      const result = await mlClient.scoreTrend(features as never);
      return result ?? { error: 'Trend scoring failed' };
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
