import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock ML client
// ---------------------------------------------------------------------------

const mockDetectRegime = vi.fn();
const mockGetMLClient = vi.fn().mockReturnValue(null);

vi.mock('@/ml/client.js', () => ({
  getMLClient: (...args: unknown[]) => mockGetMLClient(...args),
}));

import { detectMarketRegime } from '@/core/trends/regime.js';
import type { RegimeMLFeatures } from '@/ml/types.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMLClient.mockReturnValue(null);
});

// ---------------------------------------------------------------------------
// Helper: create a feature vector with defaults
// ---------------------------------------------------------------------------

function makeFeatures(overrides: Partial<RegimeMLFeatures> = {}): RegimeMLFeatures {
  return {
    returns_1d: 0,
    returns_7d: 0,
    volatility_14d: 2,
    volume_ratio: 1,
    rsi: 50,
    bb_width: 5,
    fear_greed: 50,
    funding_rate: 0.0001,
    price_vs_sma200: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Heuristic regime detection
// ---------------------------------------------------------------------------

describe('detectMarketRegime — heuristic fallback', () => {
  it('detects trending_bull with high returns and moderate volatility', async () => {
    const features = makeFeatures({
      returns_7d: 15,
      volatility_14d: 6,
      rsi: 65,
      fear_greed: 70,
    });

    const result = await detectMarketRegime('BTC', features);

    expect(result.regime).toBe('trending_bull');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.model).toBe('heuristic-regime-detector');
  });

  it('detects trending_bull via RSI + returns path', async () => {
    const features = makeFeatures({
      returns_7d: 8,
      volatility_14d: 3,
      rsi: 60,
      fear_greed: 60,
    });

    const result = await detectMarketRegime('BTC', features);

    expect(result.regime).toBe('trending_bull');
    expect(result.confidence).toBe(55);
  });

  it('detects trending_bear with negative returns and moderate volatility', async () => {
    const features = makeFeatures({
      returns_7d: -15,
      volatility_14d: 6,
      rsi: 35,
      fear_greed: 25,
    });

    const result = await detectMarketRegime('ETH', features);

    expect(result.regime).toBe('trending_bear');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('detects trending_bear via RSI + returns path', async () => {
    const features = makeFeatures({
      returns_7d: -8,
      volatility_14d: 3,
      rsi: 40,
      fear_greed: 30,
    });

    const result = await detectMarketRegime('ETH', features);

    expect(result.regime).toBe('trending_bear');
    expect(result.confidence).toBe(55);
  });

  it('detects ranging in low volatility + small returns', async () => {
    const features = makeFeatures({
      returns_7d: 1,
      volatility_14d: 2,
      rsi: 50,
      fear_greed: 50,
    });

    const result = await detectMarketRegime('BTC', features);

    expect(result.regime).toBe('ranging');
    expect(result.confidence).toBe(60);
  });

  it('detects volatile regime with high volatility', async () => {
    const features = makeFeatures({
      returns_7d: 3,
      volatility_14d: 10,
      rsi: 50,
      fear_greed: 40,
    });

    const result = await detectMarketRegime('SOL', features);

    expect(result.regime).toBe('volatile');
    expect(result.confidence).toBe(70);
  });

  it('detects capitulation with extreme fear and large negative returns', async () => {
    const features = makeFeatures({
      returns_7d: -30,
      volatility_14d: 12,
      rsi: 15,
      fear_greed: 10,
    });

    const result = await detectMarketRegime('BTC', features);

    expect(result.regime).toBe('capitulation');
    expect(result.confidence).toBe(80);
  });

  it('probabilities sum to approximately 1.0', async () => {
    const features = makeFeatures({ returns_7d: 2, volatility_14d: 3 });

    const result = await detectMarketRegime('BTC', features);

    const totalProb = Object.values(result.probabilities).reduce((s, v) => s + v, 0);
    expect(totalProb).toBeCloseTo(1.0, 1);
  });

  it('assigns highest probability to the detected regime', async () => {
    const features = makeFeatures({
      returns_7d: 15,
      volatility_14d: 6,
      rsi: 65,
    });

    const result = await detectMarketRegime('BTC', features);

    const regimeProb = result.probabilities[result.regime]!;
    for (const [key, prob] of Object.entries(result.probabilities)) {
      if (key !== result.regime) {
        expect(regimeProb).toBeGreaterThan(prob);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// ML regime detection
// ---------------------------------------------------------------------------

describe('detectMarketRegime — ML integration', () => {
  it('uses ML client when available', async () => {
    const mlResult = {
      regime: 'trending_bull' as const,
      confidence: 92,
      probabilities: {
        trending_bull: 0.85,
        trending_bear: 0.05,
        ranging: 0.05,
        volatile: 0.03,
        capitulation: 0.02,
      },
      model: 'regime-xgboost-v2',
    };

    const mlClient = { detectRegime: mockDetectRegime };
    mockGetMLClient.mockReturnValue(mlClient);
    mockDetectRegime.mockResolvedValueOnce(mlResult);

    const features = makeFeatures();
    const result = await detectMarketRegime('BTC', features);

    expect(mockDetectRegime).toHaveBeenCalledWith(features);
    expect(result.regime).toBe('trending_bull');
    expect(result.confidence).toBe(92);
    expect(result.model).toBe('regime-xgboost-v2');
    expect(result.probabilities).toEqual(mlResult.probabilities);
  });

  it('falls back to heuristic when ML client returns null', async () => {
    const mlClient = { detectRegime: mockDetectRegime };
    mockGetMLClient.mockReturnValue(mlClient);
    mockDetectRegime.mockResolvedValueOnce(null);

    const features = makeFeatures({ returns_7d: 2, volatility_14d: 2, rsi: 50 });
    const result = await detectMarketRegime('BTC', features);

    expect(result.model).toBe('heuristic-regime-detector');
  });

  it('falls back to heuristic when ML client throws', async () => {
    const mlClient = { detectRegime: mockDetectRegime };
    mockGetMLClient.mockReturnValue(mlClient);
    mockDetectRegime.mockRejectedValueOnce(new Error('ML sidecar down'));

    const features = makeFeatures({ returns_7d: 2, volatility_14d: 2 });
    const result = await detectMarketRegime('BTC', features);

    expect(result.model).toBe('heuristic-regime-detector');
    expect(result.regime).toBeDefined();
  });
});
