// ---------------------------------------------------------------------------
// Momentum strategy — RSI + MACD confirmation
// ---------------------------------------------------------------------------

import type { AgentStrategy, AgentSignals, AgentDecision } from '../types.js';
import { getMLClient } from '../../../ml/client.js';

/**
 * Buy when RSI crosses above 30 with MACD confirmation.
 * Sell when RSI drops below 70 or MACD turns bearish.
 */
export const momentumStrategy: AgentStrategy = {
  name: 'momentum',
  description: 'RSI reversal + MACD confirmation. Buy oversold bounces, sell overbought peaks.',

  evaluate(signals: AgentSignals): AgentDecision {
    const reasoning: string[] = [];
    let score = 0; // positive = buy, negative = sell

    // RSI signals
    if (signals.rsi !== null) {
      if (signals.rsi < 30) {
        score += 40;
        reasoning.push(`RSI ${signals.rsi.toFixed(1)} — oversold, buy signal`);
      } else if (signals.rsi < 40) {
        score += 20;
        reasoning.push(`RSI ${signals.rsi.toFixed(1)} — approaching oversold`);
      } else if (signals.rsi > 70) {
        score -= 40;
        reasoning.push(`RSI ${signals.rsi.toFixed(1)} — overbought, sell signal`);
      } else if (signals.rsi > 60) {
        score -= 15;
        reasoning.push(`RSI ${signals.rsi.toFixed(1)} — elevated, caution`);
      } else {
        reasoning.push(`RSI ${signals.rsi.toFixed(1)} — neutral`);
      }
    }

    // MACD confirmation
    if (signals.macdHistogram !== null) {
      if (signals.macdHistogram > 0) {
        score += 25;
        reasoning.push(
          `MACD histogram positive (${signals.macdHistogram.toFixed(4)}) — bullish momentum`,
        );
      } else {
        score -= 25;
        reasoning.push(
          `MACD histogram negative (${signals.macdHistogram.toFixed(4)}) — bearish momentum`,
        );
      }
    }

    // Bollinger %B for extreme levels
    if (signals.bollingerPercentB !== null) {
      if (signals.bollingerPercentB < 0.1) {
        score += 15;
        reasoning.push(
          `BB %B ${signals.bollingerPercentB.toFixed(2)} — near lower band, bounce potential`,
        );
      } else if (signals.bollingerPercentB > 0.9) {
        score -= 15;
        reasoning.push(
          `BB %B ${signals.bollingerPercentB.toFixed(2)} — near upper band, pullback risk`,
        );
      }
    }

    // Funding rate as contrarian signal
    if (signals.fundingRate !== null) {
      if (signals.fundingRate > 0.0005) {
        score -= 10;
        reasoning.push(
          `High funding rate ${(signals.fundingRate * 100).toFixed(4)}% — overleveraged longs`,
        );
      } else if (signals.fundingRate < -0.0003) {
        score += 10;
        reasoning.push(
          `Negative funding ${(signals.fundingRate * 100).toFixed(4)}% — capitulation signal`,
        );
      }
    }

    const action = score > 25 ? 'buy' : score < -25 ? 'sell' : 'hold';
    const confidence = Math.min(95, Math.abs(score));

    return { action, confidence, reasoning };
  },
};

/**
 * ML-enhanced momentum evaluation. Falls back to rule-based evaluate().
 */
export async function evaluateMomentumML(signals: AgentSignals): Promise<AgentDecision> {
  const mlClient = getMLClient();
  if (!mlClient) return momentumStrategy.evaluate(signals);

  try {
    const result = await mlClient.evaluateStrategy({
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
      regime: 'ranging',
    });

    if (result && result.confidence > 40) {
      return {
        action: result.action,
        confidence: Math.round(result.confidence),
        reasoning: [`ML momentum: ${result.action}`, ...result.reasoning],
      };
    }
  } catch {
    // ML unavailable
  }
  return momentumStrategy.evaluate(signals);
}
