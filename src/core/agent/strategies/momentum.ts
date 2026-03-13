// ---------------------------------------------------------------------------
// Momentum strategy — RSI + MACD confirmation
// ---------------------------------------------------------------------------

import type { AgentStrategy, AgentSignals, AgentDecision } from '../types.js';

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
