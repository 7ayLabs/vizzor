import type { ChainAdapter } from '../../chains/types.js';
import { getMLClient, initMLClient } from '../../ml/client.js';
import { getConfig } from '../../config/loader.js';
import type { WalletMLResult } from '../../ml/types.js';

export interface WalletAnalysis {
  address: string;
  chain: string;
  balance: bigint;
  transactionCount: number;
  tokenBalances: { symbol: string; address: string; balance: bigint }[];
  patterns: WalletPattern[];
  riskLevel: 'clean' | 'suspicious' | 'flagged';
  mlBehavior?: WalletMLResult;
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

  const patterns = detectPatterns(txHistory);

  // ML wallet classification
  let mlBehavior: WalletMLResult | undefined;
  try {
    let mlClient = getMLClient();
    if (!mlClient) {
      try {
        const cfg = getConfig();
        if (cfg.ml?.enabled && cfg.ml.sidecarUrl) {
          mlClient = initMLClient(cfg.ml.sidecarUrl);
        }
      } catch {
        /* config not loaded */
      }
    }
    if (mlClient && txHistory.length > 0) {
      const features = buildWalletFeatures(txHistory);
      const result = await mlClient.classifyWallet(features);
      if (result) {
        mlBehavior = result;
      }
    }
  } catch {
    /* ML unavailable */
  }

  // Determine risk level from patterns + ML
  let riskLevel: WalletAnalysis['riskLevel'] = 'clean';
  if (patterns.some((p) => p.severity === 'danger')) {
    riskLevel = 'flagged';
  } else if (patterns.some((p) => p.severity === 'warning')) {
    riskLevel = 'suspicious';
  }
  // ML can upgrade risk level
  if (mlBehavior && mlBehavior.risk_score > 0.6) {
    riskLevel = 'flagged';
  } else if (mlBehavior && mlBehavior.risk_score > 0.3 && riskLevel === 'clean') {
    riskLevel = 'suspicious';
  }

  return {
    address,
    chain: adapter.chainId,
    balance: walletBalance,
    transactionCount: txHistory.length,
    tokenBalances: [],
    patterns,
    riskLevel,
    mlBehavior,
  };
}

interface TxRecord {
  hash: string;
  from: string;
  to: string | null;
  value: bigint;
  timestamp: number;
  gasUsed?: bigint | number;
  isError?: boolean;
  status?: 'success' | 'reverted';
  methodId?: string;
  input?: string;
}

function buildWalletFeatures(txHistory: TxRecord[]) {
  const txCount = txHistory.length;
  if (txCount === 0) {
    return {
      tx_count: 0,
      avg_value_eth: 0,
      max_value_eth: 0,
      avg_gas_used: 0,
      unique_recipients: 0,
      unique_methods: 0,
      time_span_hours: 0,
      avg_interval_seconds: 3600,
      min_interval_seconds: 60,
      contract_interaction_pct: 0,
      self_transfer_pct: 0,
      high_value_tx_pct: 0,
      failed_tx_pct: 0,
      token_diversity: 0,
    };
  }

  const values = txHistory.map((tx) => Number(tx.value) / 1e18);
  const gasValues = txHistory.map((tx) => Number(tx.gasUsed ?? 21000));
  const recipients = new Set(txHistory.map((tx) => tx.to));
  const methods = new Set(
    txHistory
      .filter((tx) => tx.input && tx.input.length > 10)
      .map((tx) => (tx.input ?? '').slice(0, 10)),
  );

  const timestamps = txHistory.map((tx) => tx.timestamp).sort((a, b) => a - b);
  const timeSpan =
    timestamps.length > 1 ? ((timestamps.at(-1) ?? 0) - (timestamps[0] ?? 0)) / 3600 : 0;

  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push((timestamps[i] ?? 0) - (timestamps[i - 1] ?? 0));
  }

  const selfTxs = txHistory.filter((tx) => tx.from === tx.to).length;
  const contractTxs = txHistory.filter((tx) => tx.input && tx.input.length > 10).length;
  const revertedTxs = txHistory.filter((tx) => tx.status === 'reverted').length;
  const highValueTxs = values.filter((v) => v > 10).length;

  return {
    tx_count: txCount,
    avg_value_eth: values.reduce((a, b) => a + b, 0) / txCount,
    max_value_eth: Math.max(...values),
    avg_gas_used: gasValues.reduce((a, b) => a + b, 0) / txCount,
    unique_recipients: recipients.size,
    unique_methods: methods.size,
    time_span_hours: timeSpan,
    avg_interval_seconds:
      intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 3600,
    min_interval_seconds: intervals.length > 0 ? Math.min(...intervals) : 60,
    contract_interaction_pct: contractTxs / txCount,
    self_transfer_pct: selfTxs / txCount,
    high_value_tx_pct: highValueTxs / txCount,
    failed_tx_pct: revertedTxs / txCount,
    token_diversity: methods.size,
  };
}

function detectPatterns(txHistory: TxRecord[]): WalletPattern[] {
  const patterns: WalletPattern[] = [];
  const txCount = txHistory.length;

  if (txCount === 0) {
    patterns.push({
      type: 'new_wallet',
      description: 'Wallet has no transaction history',
      severity: 'info',
    });
    return patterns;
  }

  // Rapid transactions (bot-like)
  if (txCount > 50) {
    const timestamps = txHistory.map((tx) => tx.timestamp).sort((a, b) => a - b);
    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push((timestamps[i] ?? 0) - (timestamps[i - 1] ?? 0));
    }
    const minInterval = Math.min(...intervals);
    if (minInterval < 5) {
      patterns.push({
        type: 'rapid_transactions',
        description: `Extremely rapid transactions detected (${minInterval}s apart) — possible bot activity`,
        severity: 'warning',
      });
    }
  }

  // High failure rate
  const revertedTxs = txHistory.filter((tx) => tx.status === 'reverted').length;
  if (txCount > 10 && revertedTxs / txCount > 0.3) {
    patterns.push({
      type: 'high_failure_rate',
      description: `${Math.round((revertedTxs / txCount) * 100)}% of transactions failed — possible sniper or MEV bot`,
      severity: 'warning',
    });
  }

  // Large value transfers
  const values = txHistory.map((tx) => Number(tx.value) / 1e18);
  const maxValue = Math.max(...values);
  if (maxValue > 100) {
    patterns.push({
      type: 'whale_activity',
      description: `Large transfers detected (max: ${maxValue.toFixed(2)} ETH)`,
      severity: 'info',
    });
  }

  // Self-transfers (mixing pattern)
  const selfTxs = txHistory.filter((tx) => tx.from === tx.to).length;
  if (selfTxs / txCount > 0.2) {
    patterns.push({
      type: 'self_transfers',
      description: `${Math.round((selfTxs / txCount) * 100)}% self-transfers — possible mixing activity`,
      severity: 'danger',
    });
  }

  // Contract-heavy interaction
  const contractTxs = txHistory.filter((tx) => tx.input && tx.input.length > 10).length;
  if (contractTxs / txCount > 0.9 && txCount > 20) {
    patterns.push({
      type: 'contract_heavy',
      description: 'Almost exclusively interacts with smart contracts — automated behavior',
      severity: 'warning',
    });
  }

  return patterns;
}
