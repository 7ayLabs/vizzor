// ---------------------------------------------------------------------------
// ChronoVisor API routes — /v1/chronovisor/*
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { handleTool } from '../../../ai/tool-handler.js';
import { getDb } from '../../../data/cache.js';

export async function registerChronoVisorRoutes(server: FastifyInstance): Promise<void> {
  // GET /v1/chronovisor/predictions — list all stored predictions (history)
  // MUST be registered BEFORE /:symbol to avoid route collision
  server.get('/predictions', {
    schema: {
      tags: ['ChronoVisor'],
      summary: 'List stored prediction history',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 50 },
        },
      },
    },
    handler: async (request) => {
      const { limit } = request.query as { limit?: number };
      const db = getDb();

      // Ensure table exists (same DDL as AccuracyTracker)
      db.exec(`
        CREATE TABLE IF NOT EXISTS chronovisor_predictions (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          horizon TEXT NOT NULL,
          predicted_direction TEXT NOT NULL,
          probability REAL NOT NULL,
          composite_score REAL NOT NULL,
          initial_price REAL NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          resolved_at INTEGER,
          actual_direction TEXT,
          was_correct INTEGER
        )
      `);

      const rows = db
        .prepare(
          `SELECT id, symbol, horizon, predicted_direction, probability, composite_score,
                  initial_price, created_at, resolved_at, actual_direction, was_correct
           FROM chronovisor_predictions
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .all(limit ?? 50) as {
        id: string;
        symbol: string;
        horizon: string;
        predicted_direction: string;
        probability: number;
        composite_score: number;
        initial_price: number;
        created_at: number;
        resolved_at: number | null;
        actual_direction: string | null;
        was_correct: number | null;
      }[];

      const predictions = rows.map((r) => {
        let status = 'pending';
        if (r.was_correct === 1) status = 'correct';
        else if (r.was_correct === 0) status = 'incorrect';
        else if (r.resolved_at != null) status = 'expired';

        return {
          id: r.id,
          symbol: r.symbol,
          direction: r.predicted_direction,
          confidence: r.probability * 100,
          compositeScore: r.composite_score,
          initialPrice: r.initial_price,
          createdAt: new Date(r.created_at * 1000).toISOString(),
          resolvedAt: r.resolved_at ? new Date(r.resolved_at * 1000).toISOString() : null,
          actualDirection: r.actual_direction,
          status,
          horizon: r.horizon,
        };
      });

      return { predictions };
    },
  });

  // GET /v1/chronovisor/:symbol — ensemble prediction
  server.get('/:symbol', {
    schema: {
      tags: ['ChronoVisor'],
      summary: 'Run ChronoVisor ensemble prediction for a symbol',
      params: {
        type: 'object',
        properties: { symbol: { type: 'string' } },
        required: ['symbol'],
      },
      querystring: {
        type: 'object',
        properties: {
          horizons: {
            type: 'string',
            description: 'Comma-separated horizons (5m,15m,30m,1h,4h,1d,7d)',
          },
        },
      },
    },
    handler: async (request) => {
      const { symbol } = request.params as { symbol: string };
      const { horizons } = request.query as { horizons?: string };
      const result = await handleTool('get_chronovisor_prediction', { symbol, horizons });

      // Transform to the shape expected by ChronoVisorPanel
      const raw = result as Record<string, unknown>;
      const predictions = (raw['predictions'] ?? []) as {
        horizon: string;
        direction: string;
        probability: number;
        compositeScore: number;
        signals: Record<string, { score: number; weight: number; confidence: number }>;
      }[];

      // Build signal breakdown from first prediction (or aggregate)
      const firstPred = predictions[0];
      const signalBreakdown: Record<
        string,
        { name: string; weight: number; score: number; confidence: number }
      > = {};

      if (firstPred?.signals) {
        for (const [key, sig] of Object.entries(firstPred.signals)) {
          signalBreakdown[key] = {
            name: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
            weight: sig.weight ?? 0.2,
            score: sig.score ?? 0,
            confidence: sig.confidence ?? 50,
          };
        }
      }

      // Compute composite from predictions
      const avgScore =
        predictions.length > 0
          ? predictions.reduce((sum, p) => sum + p.compositeScore, 0) / predictions.length
          : 0;
      const avgProb =
        predictions.length > 0
          ? predictions.reduce((sum, p) => sum + p.probability, 0) / predictions.length
          : 0;
      const direction = avgScore > 10 ? 'bullish' : avgScore < -10 ? 'bearish' : 'neutral';

      // Get accuracy if available
      let accuracy: { overall: number } | null = null;
      try {
        const accResult = (await handleTool('get_prediction_accuracy', { symbol })) as Record<
          string,
          unknown
        >;
        const accData = accResult['accuracy'] as { overall: string } | undefined;
        if (accData?.overall) {
          accuracy = { overall: parseFloat(accData.overall) / 100 };
        }
      } catch {
        // accuracy not available yet
      }

      return {
        symbol: String(raw['symbol'] ?? symbol).toUpperCase(),
        predictions,
        composite: {
          score: avgScore / 100, // normalize to -1..1 for frontend
          direction,
          confidence: avgProb * 100,
          signalBreakdown,
        },
        accuracy,
      };
    },
  });

  // GET /v1/chronovisor/batch — batch predictions for multiple symbols
  server.get('/batch', {
    schema: {
      tags: ['ChronoVisor'],
      summary: 'Run ChronoVisor predictions for multiple symbols at once',
      querystring: {
        type: 'object',
        properties: {
          symbols: { type: 'string', description: 'Comma-separated symbols (max 20)' },
          horizons: { type: 'string', description: 'Comma-separated horizons (default: 1h,4h,1d)' },
        },
        required: ['symbols'],
      },
    },
    handler: async (request) => {
      const { symbols, horizons } = request.query as { symbols: string; horizons?: string };
      const list = symbols
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 20);

      const results = await Promise.allSettled(
        list.map(async (symbol) => {
          const result = await handleTool('get_chronovisor_prediction', { symbol, horizons });
          const raw = result as Record<string, unknown>;
          const predictions = (raw['predictions'] ?? []) as {
            horizon: string;
            direction: string;
            probability: number;
            compositeScore: number;
          }[];
          const avgScore =
            predictions.length > 0
              ? predictions.reduce((sum, p) => sum + p.compositeScore, 0) / predictions.length
              : 0;
          const avgProb =
            predictions.length > 0
              ? predictions.reduce((sum, p) => sum + p.probability, 0) / predictions.length
              : 0;
          return {
            symbol,
            score: avgScore,
            direction: avgScore > 10 ? 'bullish' : avgScore < -10 ? 'bearish' : 'neutral',
            confidence: avgProb * 100,
            predictions,
          };
        }),
      );

      const successes: Record<string, unknown>[] = [];
      const errors: { symbol: string; error: string }[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          successes.push(r.value);
        } else {
          errors.push({ symbol: 'unknown', error: r.reason?.message ?? String(r.reason) });
        }
      }

      return { results: successes, errors, total: list.length };
    },
  });

  // GET /v1/chronovisor/:symbol/accuracy — prediction accuracy metrics
  server.get('/:symbol/accuracy', {
    schema: {
      tags: ['ChronoVisor'],
      summary: 'Get prediction accuracy for a symbol',
      params: {
        type: 'object',
        properties: { symbol: { type: 'string' } },
        required: ['symbol'],
      },
      querystring: {
        type: 'object',
        properties: { days: { type: 'integer', default: 30 } },
      },
    },
    handler: async (request) => {
      const { symbol } = request.params as { symbol: string };
      const { days } = request.query as { days?: number };
      return handleTool('get_prediction_accuracy', { symbol, days });
    },
  });

  // GET /v1/chronovisor/stats/resolver — resolver stats
  server.get('/stats/resolver', {
    schema: {
      tags: ['ChronoVisor'],
      summary: 'Get PredictionResolver stats and feedback loop status',
    },
    handler: async () => {
      return handleTool('get_prediction_accuracy', {});
    },
  });

  // POST /v1/chronovisor/:symbol/resolve — manual resolution trigger
  server.post('/:symbol/resolve', {
    schema: {
      tags: ['ChronoVisor'],
      summary: 'Manually trigger prediction resolution',
      params: {
        type: 'object',
        properties: { symbol: { type: 'string' } },
        required: ['symbol'],
      },
    },
    handler: async () => {
      return handleTool('resolve_predictions', {});
    },
  });
}
