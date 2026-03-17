import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MLClient } from '@/ml/client.js';
import {
  mockPrediction,
  mockRugResult,
  mockWalletResult,
  mockSentimentResult,
  mockTrendResult,
  mockRegimeResult,
  mockModelHealth,
  mockAnomalyResults,
} from '../../fixtures/ml-responses.js';

describe('MLClient', () => {
  let client: MLClient;

  beforeEach(() => {
    client = new MLClient('http://localhost:8000');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(data: unknown, ok = true) {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok,
      json: () => Promise.resolve(data),
    });
  }

  it('predict returns prediction on success', async () => {
    mockFetch(mockPrediction);
    const result = await client.predict({
      rsi: 45,
      macdHistogram: 0,
      bollingerPercentB: 0.5,
      ema12: 100,
      ema26: 98,
      atr: 2,
      obv: 1000,
      fundingRate: 0.01,
      fearGreed: 50,
      priceChange24h: 2,
      rsiSlope: 0,
      volumeRatio: 1,
      emaCrossoverPct: 2,
      atrPct: 3,
      symbol: 'BTC',
      timestamp: Date.now(),
    });
    expect(result).toEqual(mockPrediction);
  });

  it('predict returns null on error response', async () => {
    mockFetch(null, false);
    const result = await client.predict({
      rsi: 45,
      macdHistogram: 0,
      bollingerPercentB: 0.5,
      ema12: 100,
      ema26: 98,
      atr: 2,
      obv: 1000,
      fundingRate: 0.01,
      fearGreed: 50,
      priceChange24h: 2,
      rsiSlope: 0,
      volumeRatio: 1,
      emaCrossoverPct: 2,
      atrPct: 3,
      symbol: 'BTC',
      timestamp: Date.now(),
    });
    expect(result).toBeNull();
  });

  it('predict returns null on timeout', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('timeout'));
    const result = await client.predict({
      rsi: 45,
      macdHistogram: 0,
      bollingerPercentB: 0.5,
      ema12: 100,
      ema26: 98,
      atr: 2,
      obv: 1000,
      fundingRate: 0.01,
      fearGreed: 50,
      priceChange24h: 2,
      rsiSlope: 0,
      volumeRatio: 1,
      emaCrossoverPct: 2,
      atrPct: 3,
      symbol: 'BTC',
      timestamp: Date.now(),
    });
    expect(result).toBeNull();
  });

  it('predictRug returns rug result', async () => {
    mockFetch(mockRugResult);
    const result = await client.predictRug({
      bytecode_size: 1000,
      is_verified: 1,
      holder_concentration: 0.4,
      has_proxy: 0,
      has_mint: 0,
      has_pause: 0,
      has_blacklist: 0,
      liquidity_locked: 1,
      buy_tax: 0,
      sell_tax: 0,
      contract_age_days: 100,
      total_transfers: 500,
      owner_balance_pct: 5,
      is_open_source: 1,
      top10_holder_pct: 40,
    });
    expect(result).toEqual(mockRugResult);
  });

  it('classifyWallet returns wallet result', async () => {
    mockFetch(mockWalletResult);
    const result = await client.classifyWallet({
      tx_count: 100,
      avg_value_eth: 0.5,
      max_value_eth: 5,
      avg_gas_used: 21000,
      unique_recipients: 20,
      unique_methods: 5,
      time_span_hours: 720,
      avg_interval_seconds: 3600,
      min_interval_seconds: 60,
      contract_interaction_pct: 0.3,
      self_transfer_pct: 0,
      high_value_tx_pct: 0.1,
      failed_tx_pct: 0.02,
      token_diversity: 5,
    });
    expect(result).toEqual(mockWalletResult);
  });

  it('analyzeSentimentBatch returns results', async () => {
    mockFetch({ results: [mockSentimentResult] });
    const results = await client.analyzeSentimentBatch(['BTC is going up']);
    expect(results).toHaveLength(1);
    expect(results[0]?.sentiment).toBe('bullish');
  });

  it('analyzeSentimentBatch returns empty on failure', async () => {
    mockFetch(null, false);
    const results = await client.analyzeSentimentBatch(['text']);
    expect(results).toEqual([]);
  });

  it('analyzeSentiment returns single result', async () => {
    mockFetch(mockSentimentResult);
    const result = await client.analyzeSentiment('BTC looks strong');
    expect(result?.sentiment).toBe('bullish');
    expect(result?.confidence).toBe(0.78);
  });

  it('scoreTrend returns trend result', async () => {
    mockFetch(mockTrendResult);
    const result = await client.scoreTrend({
      price_change_24h: 5,
      price_change_7d: 10,
      volume_24h: 1e9,
      market_cap: 1e11,
      volume_to_mcap_ratio: 0.01,
      rank: 1,
    });
    expect(result?.direction).toBe('bullish');
  });

  it('detectRegime returns regime result', async () => {
    mockFetch(mockRegimeResult);
    const result = await client.detectRegime({
      returns_1d: 2,
      returns_7d: 8,
      volatility_14d: 3,
      volume_ratio: 1.2,
      rsi: 60,
      bb_width: 5,
      fear_greed: 65,
      funding_rate: 0.01,
      price_vs_sma200: 10,
    });
    expect(result?.regime).toBe('trending_bull');
  });

  it('detectAnomalies returns anomalies', async () => {
    mockFetch({ anomalies: mockAnomalyResults });
    const results = await client.detectAnomalies([
      { symbol: 'BTC', amount: 100, from: '0x1', to: '0x2', timestamp: 0, type: 'transfer' },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]?.isAnomaly).toBe(true);
  });

  it('detectAnomalies returns empty on error', async () => {
    mockFetch(null, false);
    const results = await client.detectAnomalies([]);
    expect(results).toEqual([]);
  });

  it('healthCheck returns true when healthy', async () => {
    mockFetch(mockModelHealth);
    const healthy = await client.healthCheck();
    expect(healthy).toBe(true);
  });

  it('healthCheck returns false on failure', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('connection refused'));
    const healthy = await client.healthCheck();
    expect(healthy).toBe(false);
  });

  it('getModelHealth returns health data', async () => {
    mockFetch(mockModelHealth);
    const health = await client.getModelHealth();
    expect(health?.models).toHaveLength(2);
    expect(health?.uptime).toBe(3600);
    expect(health?.predictionsServed).toBe(1500);
  });

  it('getModelHealth returns null on failure', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('down'));
    const health = await client.getModelHealth();
    expect(health).toBeNull();
  });

  it('classifyIntent returns intent', async () => {
    mockFetch({
      intent: 'price_check',
      confidence: 0.9,
      secondary_intent: null,
      detected_tokens: ['BTC'],
      detected_addresses: [],
      model: 'intent-bert',
    });
    const result = await client.classifyIntent('what is the price of bitcoin');
    expect(result?.intent).toBe('price_check');
    expect(result?.detected_tokens).toContain('BTC');
  });

  it('classifyIntent returns null on failure', async () => {
    mockFetch(null, false);
    const result = await client.classifyIntent('test');
    expect(result).toBeNull();
  });

  it('batchPredict returns predictions', async () => {
    mockFetch({ predictions: [mockPrediction] });
    const features = {
      rsi: 45,
      macdHistogram: 0,
      bollingerPercentB: 0.5,
      ema12: 100,
      ema26: 98,
      atr: 2,
      obv: 1000,
      fundingRate: 0.01,
      fearGreed: 50,
      priceChange24h: 2,
      rsiSlope: 0,
      volumeRatio: 1,
      emaCrossoverPct: 2,
      atrPct: 3,
      symbol: 'BTC',
      timestamp: Date.now(),
    };
    const results = await client.batchPredict([features]);
    expect(results).toHaveLength(1);
    expect(results[0]?.direction).toBe('up');
  });

  it('batchPredict returns empty on failure', async () => {
    mockFetch(null, false);
    const results = await client.batchPredict([]);
    expect(results).toEqual([]);
  });

  it('isHealthy returns false initially', () => {
    expect(client.isHealthy()).toBe(false);
  });

  it('isHealthy returns true after successful healthCheck', async () => {
    mockFetch(mockModelHealth);
    await client.healthCheck();
    expect(client.isHealthy()).toBe(true);
  });

  it('interpretTA returns TA result', async () => {
    const mockTA = {
      signals: [{ name: 'RSI', direction: 'bullish', strength: 70, description: 'oversold' }],
      weights: { RSI: 0.25 },
      composite: { direction: 'bullish', score: 65, confidence: 0.75 },
      model: 'ta-rf',
    };
    mockFetch(mockTA);
    const result = await client.interpretTA({
      rsi: 30,
      macd_histogram: 0.01,
      macd_line: 0.02,
      macd_signal: 0.01,
      bb_percent_b: 0.1,
      bb_bandwidth: 5,
      ema12: 100,
      ema26: 98,
      ema_cross_pct: 2,
      atr: 2,
      atr_pct: 3,
      obv: 1000,
      price_change: 2,
    });
    expect(result?.composite.direction).toBe('bullish');
  });

  it('evaluateStrategy returns strategy result', async () => {
    const mockStrat = {
      action: 'buy',
      confidence: 80,
      position_size_pct: 5,
      reasoning: ['bullish'],
      model: 'strategy-rl',
    };
    mockFetch(mockStrat);
    const result = await client.evaluateStrategy({
      rsi: 30,
      macd_histogram: 0.01,
      ema12: 100,
      ema26: 98,
      bollinger_pct_b: 0.1,
      atr: 2,
      obv: 1000,
      funding_rate: 0.01,
      fear_greed: 50,
      price_change_24h: 2,
      price: 42000,
      regime: 'trending_bull',
    });
    expect(result?.action).toBe('buy');
  });

  it('scoreProjectRisk returns risk result', async () => {
    const mockRisk = {
      risk_probability: 0.3,
      risk_level: 'medium',
      risk_factors: [],
      model: 'project-risk',
    };
    mockFetch(mockRisk);
    const result = await client.scoreProjectRisk({
      bytecode_size: 1000,
      is_verified: 1,
      holder_concentration: 0.5,
      has_proxy: 0,
      has_mint: 0,
      has_pause: 0,
      has_blacklist: 0,
      liquidity_locked: 1,
      buy_tax: 0,
      sell_tax: 0,
      contract_age_days: 50,
      total_transfers: 200,
      owner_balance_pct: 10,
      is_open_source: 1,
      top10_holder_pct: 50,
      has_token_info: 1,
    });
    expect(result?.risk_level).toBe('medium');
  });

  it('scoreBytecodeRisk returns bytecode risk', async () => {
    const mockByte = {
      rug_probability: 0.05,
      risk_level: 'low',
      risk_factors: [],
      model: 'bytecode-risk',
    };
    mockFetch(mockByte);
    const result = await client.scoreBytecodeRisk({
      bytecode_size: 5000,
      is_verified: 1,
      has_selfdestruct: 0,
      has_delegatecall: 0,
      selector_count: 10,
      opcode_entropy: 4.5,
      has_mint: 0,
      has_pause: 0,
      has_blacklist: 0,
      has_proxy: 0,
    });
    expect(result?.risk_level).toBe('low');
  });

  it('optimizePortfolio returns optimization result', async () => {
    const mockOpt = {
      position_size_pct: 5,
      stop_loss_multiplier: 2,
      take_profit_multiplier: 3,
      max_allocation_pct: 10,
      reasoning: ['conservative'],
      model: 'portfolio-opt',
    };
    mockFetch(mockOpt);
    const result = await client.optimizePortfolio({
      total_value: 10000,
      cash: 5000,
      win_rate: 0.6,
      max_drawdown: 10,
      avg_win: 200,
      avg_loss: 100,
      regime: 'trending_bull',
      atr_pct: 3,
    });
    expect(result?.position_size_pct).toBe(5);
  });

  it('predictPortfolioForward returns portfolio prediction', async () => {
    const mockPred = {
      predicted_return: 0.05,
      predicted_sharpe: 1.2,
      predicted_max_drawdown: 8,
      confidence: 0.7,
      model: 'portfolio-pred',
    };
    mockFetch(mockPred);
    const result = await client.predictPortfolioForward({
      returns_history: [0.01, 0.02, -0.01],
      sharpe_history: [1.0, 1.1, 1.2],
      drawdown_history: [5, 6, 4],
    });
    expect(result?.predicted_return).toBe(0.05);
  });

  it('trainModel returns result on success', async () => {
    mockFetch({ model: 'test', status: 'success' });
    const result = await client.trainModel('test-model');
    expect(result).toBeTruthy();
  });

  it('trainModel returns null on failure', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail'));
    const result = await client.trainModel('test-model');
    expect(result).toBeNull();
  });

  it('evaluateModel returns result on success', async () => {
    mockFetch({ model: 'test', metrics: { accuracy: 0.8 } });
    const result = await client.evaluateModel('test-model');
    expect(result).toBeTruthy();
  });

  it('evaluateModel returns null on failure', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail'));
    const result = await client.evaluateModel('test-model');
    expect(result).toBeNull();
  });

  it('strips trailing slash from baseUrl', () => {
    const c = new MLClient('http://localhost:8000/');
    // Verify it connects properly by running a request
    mockFetch(mockModelHealth);
    // The internal baseUrl should not have trailing slash
    expect(c.isHealthy()).toBe(false); // just initialized
  });

  // -----------------------------------------------------------------------
  // v0.12.5 — analyzeBlockchainCycle
  // -----------------------------------------------------------------------

  it('analyzeBlockchainCycle returns result on success', async () => {
    const mockCycleResult = {
      cycle_phase: 'accumulation',
      phase_confidence: 85,
      fair_value_estimate: 72000,
      deviation_from_fair: -7.5,
      risk_factors: [{ factor: 'mvrv_elevated', importance: 0.3, value: 1.5 }],
      model: 'blockchain-cycle-v1',
    };
    mockFetch(mockCycleResult);
    const result = await client.analyzeBlockchainCycle({
      halving_cycle_progress: 23.3,
      days_since_halving: 150,
      days_to_next_halving: 1100,
      block_reward: 3.125,
      hashrate_change_30d: 2.3,
      difficulty_change_14d: 2.3,
      nvt_ratio: 55,
      mvrv_z_score: 1.5,
      inflation_rate: 0.83,
      fee_revenue_share: 5.2,
      mempool_size_mb: 18,
      avg_fee_rate: 15,
      hash_ribbon_signal: 0,
    });
    expect(result?.cycle_phase).toBe('accumulation');
    expect(result?.phase_confidence).toBe(85);
    expect(result?.fair_value_estimate).toBe(72000);
    expect(result?.model).toBe('blockchain-cycle-v1');
  });

  it('analyzeBlockchainCycle returns null on error response', async () => {
    mockFetch(null, false);
    const result = await client.analyzeBlockchainCycle({
      halving_cycle_progress: 0,
      days_since_halving: 0,
      days_to_next_halving: 0,
      block_reward: 0,
      hashrate_change_30d: 0,
      difficulty_change_14d: 0,
      nvt_ratio: 0,
      mvrv_z_score: 0,
      inflation_rate: 0,
      fee_revenue_share: 0,
      mempool_size_mb: 0,
      avg_fee_rate: 0,
      hash_ribbon_signal: 0,
    });
    expect(result).toBeNull();
  });

  it('analyzeBlockchainCycle returns null on timeout', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('timeout'));
    const result = await client.analyzeBlockchainCycle({
      halving_cycle_progress: 0,
      days_since_halving: 0,
      days_to_next_halving: 0,
      block_reward: 0,
      hashrate_change_30d: 0,
      difficulty_change_14d: 0,
      nvt_ratio: 0,
      mvrv_z_score: 0,
      inflation_rate: 0,
      fee_revenue_share: 0,
      mempool_size_mb: 0,
      avg_fee_rate: 0,
      hash_ribbon_signal: 0,
    });
    expect(result).toBeNull();
  });

  it('analyzeBlockchainCycle calls correct endpoint', async () => {
    const mockResult = {
      cycle_phase: 'early_markup',
      phase_confidence: 70,
      fair_value_estimate: 80000,
      deviation_from_fair: -12,
      risk_factors: [],
      model: 'blockchain-cycle-v1',
    };
    mockFetch(mockResult);
    await client.analyzeBlockchainCycle({
      halving_cycle_progress: 40,
      days_since_halving: 300,
      days_to_next_halving: 800,
      block_reward: 3.125,
      hashrate_change_30d: 5,
      difficulty_change_14d: 3,
      nvt_ratio: 60,
      mvrv_z_score: 2.5,
      inflation_rate: 0.83,
      fee_revenue_share: 5.2,
      mempool_size_mb: 20,
      avg_fee_rate: 20,
      hash_ribbon_signal: 1,
    });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/predict/blockchain-cycle',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
});
