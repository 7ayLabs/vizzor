import type { ChainAdapter } from '../../chains/types.js';
import { getMLClient } from '../../ml/client.js';
import type { AnomalyResult } from '../../ml/types.js';

export interface TokenFlow {
  from: string;
  to: string;
  amount: bigint;
  tokenAddress: string;
  blockNumber: bigint;
  timestamp: number | null;
}

export interface FlowAnalysis {
  totalInflow: bigint;
  totalOutflow: bigint;
  uniqueSenders: number;
  uniqueReceivers: number;
  largestTransfer: TokenFlow | null;
  flows: TokenFlow[];
  anomalies?: AnomalyResult[];
}

export async function analyzeTokenFlows(
  tokenAddress: string,
  address: string,
  adapter: ChainAdapter,
): Promise<FlowAnalysis> {
  const transfers = await adapter.getTokenTransfers(tokenAddress, { limit: 100 });

  const flows: TokenFlow[] = transfers.map((t) => ({
    from: t.from,
    to: t.to,
    amount: t.value,
    tokenAddress: t.tokenAddress,
    blockNumber: t.blockNumber,
    timestamp: t.timestamp ?? null,
  }));

  const senders = new Set(flows.map((f) => f.from));
  const receivers = new Set(flows.map((f) => f.to));

  let largest: TokenFlow | null = null;
  let totalIn = 0n;
  let totalOut = 0n;
  const normalizedAddress = address.toLowerCase();

  for (const flow of flows) {
    if (!largest || flow.amount > largest.amount) {
      largest = flow;
    }
    // Track inflow vs outflow relative to the target address
    if (flow.to.toLowerCase() === normalizedAddress) totalIn += flow.amount;
    if (flow.from.toLowerCase() === normalizedAddress) totalOut += flow.amount;
  }

  // ML: detect anomalies in token flows
  let anomalies: AnomalyResult[] | undefined;
  const mlClient = getMLClient();
  if (mlClient && flows.length > 0) {
    try {
      const mlFlows = flows.slice(0, 50).map((f) => ({
        symbol: tokenAddress,
        amount: Number(f.amount) / 1e18,
        from: f.from,
        to: f.to,
        timestamp: f.timestamp ?? 0,
        type: 'transfer' as const,
      }));
      const results = await mlClient.detectAnomalies(mlFlows);
      if (results.length > 0) {
        anomalies = results.filter((r) => r.isAnomaly);
      }
    } catch {
      // ML unavailable — continue without anomalies
    }
  }

  return {
    totalInflow: totalIn,
    totalOutflow: totalOut,
    uniqueSenders: senders.size,
    uniqueReceivers: receivers.size,
    largestTransfer: largest,
    flows,
    anomalies,
  };
}
