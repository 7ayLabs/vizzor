// ---------------------------------------------------------------------------
// Trend-following strategy — EMA crossover + rising OI
// ---------------------------------------------------------------------------

import type { AgentStrategy, AgentSignals, AgentDecision } from '../types.js';
import { getMLClient } from '../../../ml/client.js';

/**
 * Buy when EMA(12) crosses above EMA(26) with rising open interest.
 * Sell on death cross (EMA(12) < EMA(26)).
 */
export const trendFollowingStrategy: AgentStrategy = {
  name: 'trend-following',
  description: 'EMA crossover trend detection. Buy golden cross, sell death cross.',

  evaluate(signals: AgentSignals): AgentDecision {
    const reasoning: string[] = [];
    let score = 0;

    // EMA crossover — primary signal
    if (signals.ema12 !== null && signals.ema26 !== null) {
      const diff = signals.ema12 - signals.ema26;
      const pctDiff = signals.ema26 !== 0 ? (diff / signals.ema26) * 100 : 0;

      if (diff > 0) {
        score += 35;
        reasoning.push(`EMA(12) above EMA(26) by ${pctDiff.toFixed(2)}% — bullish trend`);
      } else {
        score -= 35;
        reasoning.push(`EMA(12) below EMA(26) by ${Math.abs(pctDiff).toFixed(2)}% — bearish trend`);
      }

      // Stronger signal when gap is widening
      if (Math.abs(pctDiff) > 2) {
        const extra = diff > 0 ? 15 : -15;
        score += extra;
        reasoning.push(
          `Strong ${diff > 0 ? 'bullish' : 'bearish'} divergence (${Math.abs(pctDiff).toFixed(2)}%)`,
        );
      }
    }

    // OBV confirmation
    if (signals.obv !== null) {
      if (signals.obv > 0) {
        score += 15;
        reasoning.push('OBV positive — volume confirms upward trend');
      } else if (signals.obv < 0) {
        score -= 15;
        reasoning.push('OBV negative — volume confirms downward trend');
      }
    }

    // 24h price change as trend confirmation
    if (signals.priceChange24h !== null) {
      if (signals.priceChange24h > 3) {
        score += 10;
        reasoning.push(
          `24h change +${signals.priceChange24h.toFixed(1)}% — strong upward momentum`,
        );
      } else if (signals.priceChange24h < -3) {
        score -= 10;
        reasoning.push(
          `24h change ${signals.priceChange24h.toFixed(1)}% — strong downward momentum`,
        );
      }
    }

    // Fear & Greed as macro overlay
    if (signals.fearGreed !== null) {
      if (signals.fearGreed > 80 && score > 0) {
        score -= 10;
        reasoning.push(`Extreme Greed (${signals.fearGreed}) — contrarian risk on longs`);
      } else if (signals.fearGreed < 20 && score < 0) {
        score += 10;
        reasoning.push(`Extreme Fear (${signals.fearGreed}) — contrarian support for bounce`);
      }
    }

    // ATR for volatility filter
    if (signals.atr !== null && signals.price !== null && signals.price > 0) {
      const atrPct = (signals.atr / signals.price) * 100;
      if (atrPct > 5) {
        reasoning.push(`High volatility (ATR ${atrPct.toFixed(2)}%) — wider stops needed`);
      }
    }

    const action = score > 25 ? 'buy' : score < -25 ? 'sell' : 'hold';
    const confidence = Math.min(95, Math.abs(score));

    return { action, confidence, reasoning };
  },
};

/**
 * ML-enhanced trend-following evaluation. Falls back to rule-based evaluate().
 */
export async function evaluateTrendFollowingML(signals: AgentSignals): Promise<AgentDecision> {
  const mlClient = getMLClient();
  if (!mlClient) return trendFollowingStrategy.evaluate(signals);

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
        reasoning: [`ML trend-following: ${result.action}`, ...result.reasoning],
      };
    }
  } catch {
    // ML unavailable
  }
  return trendFollowingStrategy.evaluate(signals);
}
