// ---------------------------------------------------------------------------
// Agent module barrel export
// ---------------------------------------------------------------------------

export type {
  AgentConfig,
  AgentStrategy,
  AgentSignals,
  AgentDecision,
  AgentCycleResult,
  AgentState,
  AgentStatus,
  AgentAction,
} from './types.js';

export {
  createAgent,
  listAgents,
  getAgentById,
  getAgentByName,
  deleteAgent,
  startAgent,
  stopAgent,
  getAgentStatus,
  getRecentDecisions,
  listStrategies,
} from './manager.js';

export { AgentEngine } from './engine.js';
export { getWalletBalance, isValidAddress } from './wallet.js';
