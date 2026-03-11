import type { ChainAdapter } from '../../chains/types.js';

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
}

export async function analyzeTokenFlows(
  tokenAddress: string,
  _address: string,
  adapter: ChainAdapter,
): Promise<FlowAnalysis> {
  const transfers = await adapter.getTokenTransfers(tokenAddress, { limit: 100 });

  const flows: TokenFlow[] = transfers.map((t) => ({
    from: t.from,
    to: t.to,
    amount: t.value,
    tokenAddress: t.tokenAddress,
    blockNumber: t.blockNumber,
    timestamp: null,
  }));

  const senders = new Set(flows.map((f) => f.from));
  const receivers = new Set(flows.map((f) => f.to));

  let largest: TokenFlow | null = null;
  let totalIn = 0n;
  let totalOut = 0n;

  for (const flow of flows) {
    if (!largest || flow.amount > largest.amount) {
      largest = flow;
    }
    totalIn += flow.amount;
    totalOut += flow.amount;
  }

  return {
    totalInflow: totalIn,
    totalOutflow: totalOut,
    uniqueSenders: senders.size,
    uniqueReceivers: receivers.size,
    largestTransfer: largest,
    flows,
  };
}
