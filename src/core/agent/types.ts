// ---------------------------------------------------------------------------
// Autonomous agent types
// ---------------------------------------------------------------------------

export type AgentStatus = 'idle' | 'running' | 'stopped' | 'error';

export interface AgentConfig {
  id: string;
  name: string;
  strategy: string;
  pairs: string[];
  interval: number; // cycle interval in seconds
  createdAt: number;
  updatedAt: number;
}

export interface AgentStrategy {
  name: string;
  description: string;
  evaluate(signals: AgentSignals): AgentDecision;
}

export interface AgentSignals {
  rsi: number | null;
  macdHistogram: number | null;
  ema12: number | null;
  ema26: number | null;
  bollingerPercentB: number | null;
  atr: number | null;
  obv: number | null;
  fundingRate: number | null;
  fearGreed: number | null;
  priceChange24h: number | null;
  price: number | null;
}

export type AgentAction = 'buy' | 'sell' | 'hold';

export interface AgentDecision {
  action: AgentAction;
  confidence: number; // 0-100
  reasoning: string[];
}

export interface AgentCycleResult {
  agentId: string;
  symbol: string;
  timestamp: number;
  signals: AgentSignals;
  decision: AgentDecision;
}

export interface AgentState {
  config: AgentConfig;
  status: AgentStatus;
  lastCycle: AgentCycleResult | null;
  cycleCount: number;
  error: string | null;
}
