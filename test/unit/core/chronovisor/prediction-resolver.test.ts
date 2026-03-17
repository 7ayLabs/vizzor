// ---------------------------------------------------------------------------
// PredictionResolver unit tests — v0.12.5
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@/data/cache.js', () => {
  const rows: unknown[] = [];
  const stmts = new Map<
    string,
    {
      run: (...args: unknown[]) => void;
      get: (...args: unknown[]) => unknown;
      all: (...args: unknown[]) => unknown[];
    }
  >();
  return {
    getDb: () => ({
      exec: vi.fn(),
      prepare: (sql: string) => {
        if (!stmts.has(sql)) {
          stmts.set(sql, {
            run: vi.fn(),
            get: vi.fn(() => undefined),
            all: vi.fn(() => rows),
          });
        }
        return stmts.get(sql)!;
      },
    }),
  };
});

vi.mock('@/data/sources/binance.js', () => ({
  fetchTickerPrice: vi.fn().mockResolvedValue({
    symbol: 'BTC',
    price: 70000,
    change24h: 2.5,
  }),
}));

import { PredictionResolver } from '@/core/chronovisor/prediction-resolver.js';
import { AccuracyTracker } from '@/core/chronovisor/accuracy-tracker.js';
import { WeightLearner } from '@/core/chronovisor/weight-learner.js';
import type { PredictionRecord } from '@/core/chronovisor/types.js';
import { fetchTickerPrice } from '@/data/sources/binance.js';

describe('PredictionResolver', () => {
  let tracker: AccuracyTracker;
  let learner: WeightLearner;
  let resolver: PredictionResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    tracker = new AccuracyTracker();
    learner = new WeightLearner();
    resolver = new PredictionResolver(tracker, learner, 60_000);
  });

  afterEach(() => {
    resolver.stop();
  });

  it('starts and stops without errors', () => {
    resolver.start();
    expect(resolver.getStats().isRunning).toBe(true);
    resolver.stop();
    expect(resolver.getStats().isRunning).toBe(false);
  });

  it('resolves nothing when no pending predictions', async () => {
    vi.spyOn(tracker, 'getPendingPredictions').mockReturnValue([]);
    const resolved = await resolver.resolvePending();
    expect(resolved).toBe(0);
  });

  it('skips predictions whose horizon has not expired', async () => {
    const now = Math.floor(Date.now() / 1000);
    vi.spyOn(tracker, 'getPendingPredictions').mockReturnValue([
      {
        id: 'BTC_4h_recent',
        symbol: 'BTC',
        horizon: '4h',
        predictedDirection: 'up',
        probability: 0.7,
        compositeScore: 0.5,
        initialPrice: 68000,
        createdAt: now - 3600, // only 1h ago, 4h horizon not expired
        resolvedAt: null,
        actualDirection: null,
        wasCorrect: null,
      },
    ]);

    const resolved = await resolver.resolvePending();
    expect(resolved).toBe(0);
  });

  it('resolves expired prediction as CORRECT when direction matches', async () => {
    const now = Math.floor(Date.now() / 1000);
    const resolveSpy = vi.spyOn(tracker, 'resolvePrediction');

    vi.spyOn(tracker, 'getPendingPredictions').mockReturnValue([
      {
        id: 'BTC_1h_expired',
        symbol: 'BTC',
        horizon: '1h',
        predictedDirection: 'up',
        probability: 0.7,
        compositeScore: 0.5,
        initialPrice: 68000,
        createdAt: now - 7200, // 2h ago, 1h horizon expired
        resolvedAt: null,
        actualDirection: null,
        wasCorrect: null,
      },
    ]);
    vi.spyOn(tracker, 'getAccuracy').mockReturnValue({
      overall: 0,
      total: 0,
      correct: 0,
      byHorizon: {},
    });

    // price went up: 68000 → 70000 (+2.9%)
    vi.mocked(fetchTickerPrice).mockResolvedValue({
      symbol: 'BTC',
      price: 70000,
      change24h: 2.5,
    });

    const resolved = await resolver.resolvePending();
    expect(resolved).toBe(1);
    expect(resolveSpy).toHaveBeenCalledWith('BTC_1h_expired', 'up', 70000);

    const stats = resolver.getStats();
    expect(stats.totalResolved).toBe(1);
    expect(stats.correct).toBe(1);
    expect(stats.incorrect).toBe(0);
  });

  it('resolves expired prediction as INCORRECT when direction wrong', async () => {
    const now = Math.floor(Date.now() / 1000);
    const resolveSpy = vi.spyOn(tracker, 'resolvePrediction');

    vi.spyOn(tracker, 'getPendingPredictions').mockReturnValue([
      {
        id: 'ETH_4h_wrong',
        symbol: 'ETH',
        horizon: '4h',
        predictedDirection: 'up',
        probability: 0.6,
        compositeScore: 0.3,
        initialPrice: 3500,
        createdAt: now - 20000, // expired
        resolvedAt: null,
        actualDirection: null,
        wasCorrect: null,
      },
    ]);
    vi.spyOn(tracker, 'getAccuracy').mockReturnValue({
      overall: 0,
      total: 0,
      correct: 0,
      byHorizon: {},
    });

    // price went down: 3500 → 3400 (-2.86%)
    vi.mocked(fetchTickerPrice).mockResolvedValue({
      symbol: 'ETH',
      price: 3400,
      change24h: -3.0,
    });

    const resolved = await resolver.resolvePending();
    expect(resolved).toBe(1);
    expect(resolveSpy).toHaveBeenCalledWith('ETH_4h_wrong', 'down', 3400);

    const stats = resolver.getStats();
    expect(stats.correct).toBe(0);
    expect(stats.incorrect).toBe(1);
  });

  it('classifies small changes as sideways', async () => {
    const now = Math.floor(Date.now() / 1000);
    const resolveSpy = vi.spyOn(tracker, 'resolvePrediction');

    vi.spyOn(tracker, 'getPendingPredictions').mockReturnValue([
      {
        id: 'BTC_1h_flat',
        symbol: 'BTC',
        horizon: '1h',
        predictedDirection: 'sideways',
        probability: 0.5,
        compositeScore: 0.0,
        initialPrice: 70000,
        createdAt: now - 7200,
        resolvedAt: null,
        actualDirection: null,
        wasCorrect: null,
      },
    ]);
    vi.spyOn(tracker, 'getAccuracy').mockReturnValue({
      overall: 0,
      total: 0,
      correct: 0,
      byHorizon: {},
    });

    // price barely moved: 70000 → 70100 (+0.14%, below 0.3% threshold)
    vi.mocked(fetchTickerPrice).mockResolvedValue({
      symbol: 'BTC',
      price: 70100,
      change24h: 0.1,
    });

    await resolver.resolvePending();
    expect(resolveSpy).toHaveBeenCalledWith('BTC_1h_flat', 'sideways', 70100);
  });

  it('skips predictions with initialPrice 0 (pre-migration)', async () => {
    const now = Math.floor(Date.now() / 1000);

    vi.spyOn(tracker, 'getPendingPredictions').mockReturnValue([
      {
        id: 'BTC_old',
        symbol: 'BTC',
        horizon: '1h',
        predictedDirection: 'up',
        probability: 0.7,
        compositeScore: 0.5,
        initialPrice: 0, // pre-migration record
        createdAt: now - 7200,
        resolvedAt: null,
        actualDirection: null,
        wasCorrect: null,
      },
    ]);

    const resolved = await resolver.resolvePending();
    expect(resolved).toBe(0);
  });

  it('continues resolving other symbols when one price fetch fails', async () => {
    const now = Math.floor(Date.now() / 1000);
    const resolveSpy = vi.spyOn(tracker, 'resolvePrediction');

    vi.spyOn(tracker, 'getPendingPredictions').mockReturnValue([
      {
        id: 'DOGE_1h',
        symbol: 'DOGE',
        horizon: '1h',
        predictedDirection: 'up',
        probability: 0.6,
        compositeScore: 0.3,
        initialPrice: 0.15,
        createdAt: now - 7200,
        resolvedAt: null,
        actualDirection: null,
        wasCorrect: null,
      },
      {
        id: 'BTC_1h',
        symbol: 'BTC',
        horizon: '1h',
        predictedDirection: 'down',
        probability: 0.7,
        compositeScore: -0.5,
        initialPrice: 72000,
        createdAt: now - 7200,
        resolvedAt: null,
        actualDirection: null,
        wasCorrect: null,
      },
    ]);
    vi.spyOn(tracker, 'getAccuracy').mockReturnValue({
      overall: 0,
      total: 0,
      correct: 0,
      byHorizon: {},
    });

    // DOGE fails, BTC succeeds
    vi.mocked(fetchTickerPrice)
      .mockRejectedValueOnce(new Error('No Binance pair'))
      .mockResolvedValueOnce({ symbol: 'BTC', price: 70000, change24h: -2 });

    const resolved = await resolver.resolvePending();
    expect(resolved).toBe(1); // only BTC resolved
    expect(resolveSpy).toHaveBeenCalledWith('BTC_1h', 'down', 70000);
  });

  it('triggers weight update when enough predictions resolved', async () => {
    const now = Math.floor(Date.now() / 1000);
    const updateSpy = vi.spyOn(learner, 'updateWeights');

    vi.spyOn(tracker, 'getPendingPredictions').mockReturnValue([
      {
        id: 'BTC_1h_1',
        symbol: 'BTC',
        horizon: '1h',
        predictedDirection: 'up',
        probability: 0.7,
        compositeScore: 0.5,
        initialPrice: 68000,
        createdAt: now - 7200,
        resolvedAt: null,
        actualDirection: null,
        wasCorrect: null,
      },
    ]);

    // Return enough history to trigger weight update
    vi.spyOn(tracker, 'getAccuracy').mockReturnValue({
      overall: 0.65,
      total: 10,
      correct: 6,
      byHorizon: { '1h': 0.7, '4h': 0.6 },
    });

    await resolver.resolvePending();
    expect(updateSpy).toHaveBeenCalledWith(
      'BTC',
      expect.objectContaining({
        onChain: 0.65,
        mlEnsemble: 0.65,
        socialNarrative: 0.65,
      }),
    );
  });

  it('does not trigger weight update with fewer than 5 resolved', async () => {
    const now = Math.floor(Date.now() / 1000);
    const updateSpy = vi.spyOn(learner, 'updateWeights');

    vi.spyOn(tracker, 'getPendingPredictions').mockReturnValue([
      {
        id: 'BTC_1h_few',
        symbol: 'BTC',
        horizon: '1h',
        predictedDirection: 'up',
        probability: 0.7,
        compositeScore: 0.5,
        initialPrice: 68000,
        createdAt: now - 7200,
        resolvedAt: null,
        actualDirection: null,
        wasCorrect: null,
      },
    ]);

    // Only 3 total resolved — too few
    vi.spyOn(tracker, 'getAccuracy').mockReturnValue({
      overall: 0.67,
      total: 3,
      correct: 2,
      byHorizon: {},
    });

    await resolver.resolvePending();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('stats accumulate across multiple resolve cycles', async () => {
    const now = Math.floor(Date.now() / 1000);

    vi.spyOn(tracker, 'getAccuracy').mockReturnValue({
      overall: 0,
      total: 0,
      correct: 0,
      byHorizon: {},
    });

    // Cycle 1: correct prediction
    vi.spyOn(tracker, 'getPendingPredictions').mockReturnValueOnce([
      {
        id: 'BTC_1',
        symbol: 'BTC',
        horizon: '1h',
        predictedDirection: 'up',
        probability: 0.7,
        compositeScore: 0.5,
        initialPrice: 68000,
        createdAt: now - 7200,
        resolvedAt: null,
        actualDirection: null,
        wasCorrect: null,
      },
    ]);
    vi.mocked(fetchTickerPrice).mockResolvedValueOnce({
      symbol: 'BTC',
      price: 70000,
      change24h: 2,
    });

    await resolver.resolvePending();

    // Cycle 2: incorrect prediction
    vi.spyOn(tracker, 'getPendingPredictions').mockReturnValueOnce([
      {
        id: 'BTC_2',
        symbol: 'BTC',
        horizon: '1h',
        predictedDirection: 'up',
        probability: 0.6,
        compositeScore: 0.3,
        initialPrice: 70000,
        createdAt: now - 7200,
        resolvedAt: null,
        actualDirection: null,
        wasCorrect: null,
      },
    ]);
    vi.mocked(fetchTickerPrice).mockResolvedValueOnce({
      symbol: 'BTC',
      price: 69000,
      change24h: -1,
    });

    await resolver.resolvePending();

    const stats = resolver.getStats();
    expect(stats.totalResolved).toBe(2);
    expect(stats.correct).toBe(1);
    expect(stats.incorrect).toBe(1);
  });
});
