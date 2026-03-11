import type { ChainAdapter } from '../../chains/types.js';

export interface WalletAnalysis {
  address: string;
  chain: string;
  balance: bigint;
  transactionCount: number;
  tokenBalances: { symbol: string; address: string; balance: bigint }[];
  patterns: WalletPattern[];
  riskLevel: 'clean' | 'suspicious' | 'flagged';
}

export interface WalletPattern {
  type: string;
  description: string;
  severity: 'info' | 'warning' | 'danger';
}

export async function analyzeWallet(
  address: string,
  adapter: ChainAdapter,
): Promise<WalletAnalysis> {
  const [balance, transactions] = await Promise.allSettled([
    adapter.getBalance(address),
    adapter.getTransactionHistory(address, { limit: 100 }),
  ]);

  const walletBalance = balance.status === 'fulfilled' ? balance.value : 0n;
  const txHistory = transactions.status === 'fulfilled' ? transactions.value : [];

  const patterns = detectPatterns(txHistory.length);

  return {
    address,
    chain: adapter.chainId,
    balance: walletBalance,
    transactionCount: txHistory.length,
    tokenBalances: [],
    patterns,
    riskLevel: patterns.some((p) => p.severity === 'danger') ? 'flagged' : 'clean',
  };
}

function detectPatterns(txCount: number): WalletPattern[] {
  const patterns: WalletPattern[] = [];

  if (txCount === 0) {
    patterns.push({
      type: 'new_wallet',
      description: 'Wallet has no transaction history',
      severity: 'info',
    });
  }

  // TODO: Add more pattern detection:
  // - Rapid token swaps (bot activity)
  // - Large inflows from mixers
  // - Interaction with known scam contracts
  // - Airdrop farming patterns

  return patterns;
}
