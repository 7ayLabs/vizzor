// ---------------------------------------------------------------------------
// Walk-forward analysis — splits data into train/test windows
// ---------------------------------------------------------------------------

import type { BacktestConfig, BacktestResult, BacktestMetrics } from './types.js';
import { BacktestEngine } from './engine.js';

export interface WalkForwardConfig {
  base: BacktestConfig;
  windowSizeMonths: number;
  stepSizeMonths: number;
}

export interface WalkForwardResult {
  windows: BacktestResult[];
  aggregated: BacktestMetrics;
}

export async function runWalkForward(config: WalkForwardConfig): Promise<WalkForwardResult> {
  const from = new Date(config.base.from);
  const to = new Date(config.base.to);
  const windows: BacktestResult[] = [];

  let windowStart = new Date(from);

  while (windowStart < to) {
    const windowEnd = new Date(windowStart);
    windowEnd.setMonth(windowEnd.getMonth() + config.windowSizeMonths);
    if (windowEnd > to) break;

    const engine = new BacktestEngine({
      ...config.base,
      from: windowStart.toISOString().split('T')[0]!,
      to: windowEnd.toISOString().split('T')[0]!,
    });

    const result = await engine.run();
    windows.push(result);

    windowStart = new Date(windowStart);
    windowStart.setMonth(windowStart.getMonth() + config.stepSizeMonths);
  }

  const aggregated = aggregateMetrics(windows.map((w) => w.metrics));

  return { windows, aggregated };
}

function aggregateMetrics(all: BacktestMetrics[]): BacktestMetrics {
  if (all.length === 0) {
    return {
      totalReturn: 0,
      totalReturnPct: 0,
      winRate: 0,
      totalTrades: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      avgHoldingPeriodMs: 0,
    };
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    totalReturn: all.reduce((s, m) => s + m.totalReturn, 0),
    totalReturnPct: avg(all.map((m) => m.totalReturnPct)),
    winRate: avg(all.map((m) => m.winRate)),
    totalTrades: all.reduce((s, m) => s + m.totalTrades, 0),
    profitFactor: avg(all.map((m) => (m.profitFactor === Infinity ? 10 : m.profitFactor))),
    sharpeRatio: avg(all.map((m) => m.sharpeRatio)),
    maxDrawdown: Math.max(...all.map((m) => m.maxDrawdown)),
    avgHoldingPeriodMs: avg(all.map((m) => m.avgHoldingPeriodMs)),
  };
}
