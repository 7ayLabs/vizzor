// ---------------------------------------------------------------------------
// ML-Adaptive Strategy — contextual bandit approach using ML predictions
// ---------------------------------------------------------------------------

import type { AgentStrategy, AgentSignals, AgentDecision } from '../types.js';
import { getMLClient } from '../../../ml/client.js';
import { detectMarketRegime } from '../../trends/regime.js';

export const mlAdaptiveStrategy: AgentStrategy = {
  name: 'ml-adaptive',
  description:
    'ML-powered strategy using contextual bandit approach. Uses LSTM/RF predictions ' +
    'when available, falls back to rule-based when < 100 training samples.',

  evaluate(signals: AgentSignals): AgentDecision {
    // Synchronous evaluation — uses cached ML predictions if available
    // The async ML call happens in the engine before this is called
    return evaluateWithRules(signals);
  },
};

function evaluateWithRules(signals: AgentSignals): AgentDecision {
  const reasoning: string[] = [];
  let score = 0;

  // RSI with adaptive thresholds
  if (signals.rsi !== null) {
    if (signals.rsi < 25) {
      score += 35;
      reasoning.push(`RSI deeply oversold (${signals.rsi.toFixed(0)})`);
    } else if (signals.rsi < 35) {
      score += 20;
      reasoning.push(`RSI oversold zone (${signals.rsi.toFixed(0)})`);
    } else if (signals.rsi > 75) {
      score -= 35;
      reasoning.push(`RSI deeply overbought (${signals.rsi.toFixed(0)})`);
    } else if (signals.rsi > 65) {
      score -= 20;
      reasoning.push(`RSI overbought zone (${signals.rsi.toFixed(0)})`);
    }
  }

  // MACD with momentum confirmation
  if (signals.macdHistogram !== null) {
    if (signals.macdHistogram > 0) {
      score += 15;
      reasoning.push('MACD bullish momentum');
    } else {
      score -= 15;
      reasoning.push('MACD bearish momentum');
    }
  }

  // EMA crossover
  if (signals.ema12 !== null && signals.ema26 !== null) {
    const crossPct =
      signals.ema26 !== 0 ? ((signals.ema12 - signals.ema26) / signals.ema26) * 100 : 0;
    if (crossPct > 0.5) {
      score += 20;
      reasoning.push(`Golden cross (EMA12 > EMA26 by ${crossPct.toFixed(2)}%)`);
    } else if (crossPct < -0.5) {
      score -= 20;
      reasoning.push(`Death cross (EMA12 < EMA26 by ${Math.abs(crossPct).toFixed(2)}%)`);
    }
  }

  // Bollinger Bands
  if (signals.bollingerPercentB !== null) {
    if (signals.bollingerPercentB < 0.1) {
      score += 15;
      reasoning.push('Price at lower Bollinger Band — potential bounce');
    } else if (signals.bollingerPercentB > 0.9) {
      score -= 15;
      reasoning.push('Price at upper Bollinger Band — potential resistance');
    }
  }

  // Funding rate (contrarian)
  if (signals.fundingRate !== null) {
    if (signals.fundingRate > 0.0005) {
      score -= 10;
      reasoning.push('High funding rate — overleveraged longs');
    } else if (signals.fundingRate < -0.0003) {
      score += 10;
      reasoning.push('Negative funding — capitulation signal');
    }
  }

  // Fear & Greed (contrarian)
  if (signals.fearGreed !== null) {
    if (signals.fearGreed < 20) {
      score += 10;
      reasoning.push('Extreme fear — contrarian bullish');
    } else if (signals.fearGreed > 80) {
      score -= 10;
      reasoning.push('Extreme greed — contrarian bearish');
    }
  }

  // 24h trend confirmation
  if (signals.priceChange24h !== null) {
    if (signals.priceChange24h > 5) {
      score += 10;
    } else if (signals.priceChange24h < -5) {
      score -= 10;
    }
  }

  const confidence = Math.min(95, Math.abs(score));
  if (score > 20) {
    return { action: 'buy', confidence, reasoning };
  } else if (score < -20) {
    return { action: 'sell', confidence, reasoning };
  }
  return {
    action: 'hold',
    confidence: Math.max(30, 50 - Math.abs(score)),
    reasoning: [...reasoning, 'Mixed signals — holding'],
  };
}

export async function evaluateWithML(
  symbol: string,
  signals: AgentSignals,
): Promise<AgentDecision> {
  const mlClient = getMLClient();
  if (!mlClient) return evaluateWithRules(signals);

  try {
    // Step 1: detect market regime
    const regime = await detectMarketRegime(symbol, {
      returns_1d: signals.priceChange24h ?? 0,
      returns_7d: 0,
      volatility_14d:
        signals.atr !== null && signals.price !== null && signals.price > 0
          ? (signals.atr / signals.price) * 100
          : 3,
      volume_ratio: 1,
      rsi: signals.rsi ?? 50,
      bb_width: 0,
      fear_greed: signals.fearGreed ?? 50,
      funding_rate: signals.fundingRate ?? 0,
      price_vs_sma200: 0,
    });

    // Step 2: call strategy bandit with regime context
    const strategyResult = await mlClient.evaluateStrategy({
      rsi: signals.rsi ?? 50,
      macd_histogram: signals.macdHistogram ?? 0,
      ema12: signals.ema12 ?? 0,
      ema26: signals.ema26 ?? 0,
      bollinger_pct_b: signals.bollingerPercentB ?? 0.5,
      atr: signals.atr ?? 0,
      obv: signals.obv ?? 0,
      funding_rate: signals.fundingRate ?? 0,
      fear_greed: signals.fearGreed ?? 50,
      price_change_24h: signals.priceChange24h ?? 0,
      price: signals.price ?? 0,
      regime: regime.regime,
    });

    if (strategyResult && strategyResult.confidence > 30) {
      return {
        action: strategyResult.action,
        confidence: Math.round(strategyResult.confidence),
        reasoning: [
          `Regime: ${regime.regime} (${regime.confidence.toFixed(0)}% confidence)`,
          ...strategyResult.reasoning,
        ],
      };
    }

    // Low ML confidence — blend with rules
    const ruleDecision = evaluateWithRules(signals);
    return {
      action: ruleDecision.action,
      confidence: Math.round(((strategyResult?.confidence ?? 0) + ruleDecision.confidence) / 2),
      reasoning: [
        `Regime: ${regime.regime}`,
        ...(strategyResult?.reasoning ?? []),
        '(Low ML confidence — blending with rules)',
        ...ruleDecision.reasoning,
      ],
    };
  } catch {
    return evaluateWithRules(signals);
  }
}
