// ---------------------------------------------------------------------------
// Technical analysis types
// ---------------------------------------------------------------------------

export type SignalDirection = 'bullish' | 'bearish' | 'neutral';

export interface TechnicalSignal {
  name: string;
  value: number;
  signal: SignalDirection;
  strength: number; // 0-100
  description: string;
}

export interface TechnicalAnalysis {
  symbol: string;
  timeframe: string;
  signals: TechnicalSignal[];
  composite: {
    direction: SignalDirection;
    score: number; // -100 to +100
    confidence: number; // 0-100
  };
  indicators: {
    rsi: number | null;
    macd: { macd: number; signal: number; histogram: number } | null;
    bollingerBands: {
      upper: number;
      middle: number;
      lower: number;
      percentB: number;
    } | null;
    ema12: number | null;
    ema26: number | null;
    sma20: number | null;
    atr: number | null;
    obv: number | null;
  };
  timestamp: number;
}
