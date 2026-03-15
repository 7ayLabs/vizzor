import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChainAdapter, Transaction } from '@/chains/types.js';

// ---------------------------------------------------------------------------
// Mock ML client
// ---------------------------------------------------------------------------

const mockClassifyWallet = vi.fn();

vi.mock('@/ml/client.js', () => ({
  getMLClient: vi.fn(() => null),
  initMLClient: vi.fn(),
}));

vi.mock('@/config/loader.js', () => ({
  getConfig: vi.fn(() => ({
    ml: { enabled: false, sidecarUrl: '' },
  })),
}));

import { analyzeWallet } from '@/core/forensics/wallet-analyzer.js';
import { getMLClient } from '@/ml/client.js';

// ---------------------------------------------------------------------------
// Mock chain adapter (same pattern as rug-detector.test.ts)
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Partial<ChainAdapter> = {}): ChainAdapter {
  return {
    chainId: 'ethereum',
    name: 'Ethereum',
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    getBalance: vi.fn().mockResolvedValue(0n),
    getTokenBalance: vi.fn().mockResolvedValue(0n),
    getTransactionHistory: vi.fn().mockResolvedValue([]),
    getTokenTransfers: vi.fn().mockResolvedValue([]),
    getContractCode: vi.fn().mockResolvedValue('0x'),
    readContract: vi.fn().mockResolvedValue(null),
    getContractEvents: vi.fn().mockResolvedValue([]),
    getTokenInfo: vi.fn().mockResolvedValue({
      address: '0x1234',
      name: 'TestToken',
      symbol: 'TEST',
      decimals: 18,
      totalSupply: 1000000000000000000000n,
    }),
    getTopHolders: vi.fn().mockResolvedValue([]),
    getBlockNumber: vi.fn().mockResolvedValue(18000000n),
    getBlock: vi.fn().mockResolvedValue({
      number: 18000000n,
      hash: '0x',
      parentHash: '0x',
      timestamp: 1700000000,
      gasUsed: 0n,
      gasLimit: 30000000n,
      baseFeePerGas: null,
      transactionCount: 0,
    }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    hash: '0xabc',
    blockNumber: 18000000n,
    from: '0xSender',
    to: '0xReceiver',
    value: 1000000000000000000n, // 1 ETH
    gasUsed: 21000n,
    gasPrice: 20000000000n,
    timestamp: 1700000000,
    status: 'success',
    input: '0x',
    ...overrides,
  };
}

function generateTxHistory(count: number, overrides: Partial<Transaction> = {}): Transaction[] {
  return Array.from({ length: count }, (_, i) =>
    makeTx({
      hash: `0x${i.toString(16).padStart(64, '0')}`,
      timestamp: 1700000000 + i * 60, // 1 minute apart by default
      ...overrides,
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockClassifyWallet.mockReset();
});

describe('analyzeWallet', () => {
  it('handles empty transaction history', async () => {
    const adapter = createMockAdapter({
      getBalance: vi.fn().mockResolvedValue(100n),
      getTransactionHistory: vi.fn().mockResolvedValue([]),
    });

    const result = await analyzeWallet('0xTestWallet', adapter);

    expect(result.address).toBe('0xTestWallet');
    expect(result.chain).toBe('ethereum');
    expect(result.balance).toBe(100n);
    expect(result.transactionCount).toBe(0);
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]!.type).toBe('new_wallet');
    expect(result.patterns[0]!.severity).toBe('info');
    expect(result.riskLevel).toBe('clean');
  });

  it('reports clean risk for normal transactions', async () => {
    const txHistory = generateTxHistory(15, { status: 'success' });
    const adapter = createMockAdapter({
      getBalance: vi.fn().mockResolvedValue(5000000000000000000n), // 5 ETH
      getTransactionHistory: vi.fn().mockResolvedValue(txHistory),
    });

    const result = await analyzeWallet('0xNormal', adapter);

    expect(result.transactionCount).toBe(15);
    expect(result.riskLevel).toBe('clean');
    expect(result.patterns.every((p) => p.severity !== 'danger')).toBe(true);
  });

  it('detects rapid transaction patterns (bot-like)', async () => {
    // Need > 50 transactions with intervals < 5 seconds
    const txHistory = Array.from({ length: 60 }, (_, i) =>
      makeTx({
        hash: `0x${i.toString(16).padStart(64, '0')}`,
        timestamp: 1700000000 + i * 2, // 2 seconds apart
      }),
    );

    const adapter = createMockAdapter({
      getTransactionHistory: vi.fn().mockResolvedValue(txHistory),
    });

    const result = await analyzeWallet('0xBot', adapter);

    const rapidPattern = result.patterns.find((p) => p.type === 'rapid_transactions');
    expect(rapidPattern).toBeDefined();
    expect(rapidPattern!.severity).toBe('warning');
    expect(rapidPattern!.description).toContain('rapid transactions');
  });

  it('does not flag rapid transactions when count <= 50', async () => {
    // 40 tx, 2 seconds apart — should NOT trigger rapid check (count <= 50)
    const txHistory = Array.from({ length: 40 }, (_, i) =>
      makeTx({
        hash: `0x${i.toString(16).padStart(64, '0')}`,
        timestamp: 1700000000 + i * 2,
      }),
    );

    const adapter = createMockAdapter({
      getTransactionHistory: vi.fn().mockResolvedValue(txHistory),
    });

    const result = await analyzeWallet('0xNotBot', adapter);

    const rapidPattern = result.patterns.find((p) => p.type === 'rapid_transactions');
    expect(rapidPattern).toBeUndefined();
  });

  it('detects high failure rate', async () => {
    // More than 10 txs, > 30% reverted
    const txHistory = [
      ...generateTxHistory(5, { status: 'success' }),
      ...Array.from({ length: 8 }, (_, i) =>
        makeTx({
          hash: `0xfail${i}`,
          timestamp: 1700001000 + i * 60,
          status: 'reverted',
        }),
      ),
    ];

    const adapter = createMockAdapter({
      getTransactionHistory: vi.fn().mockResolvedValue(txHistory),
    });

    const result = await analyzeWallet('0xSniper', adapter);

    const failPattern = result.patterns.find((p) => p.type === 'high_failure_rate');
    expect(failPattern).toBeDefined();
    expect(failPattern!.severity).toBe('warning');
    expect(failPattern!.description).toContain('failed');
  });

  it('does not flag low failure rate', async () => {
    // 20 txs with only 1 reverted (5%)
    const txHistory = [
      ...generateTxHistory(19, { status: 'success' }),
      makeTx({ hash: '0xfail0', timestamp: 1700002000, status: 'reverted' }),
    ];

    const adapter = createMockAdapter({
      getTransactionHistory: vi.fn().mockResolvedValue(txHistory),
    });

    const result = await analyzeWallet('0xNormal', adapter);

    const failPattern = result.patterns.find((p) => p.type === 'high_failure_rate');
    expect(failPattern).toBeUndefined();
  });

  it('detects whale activity (large balances > 100 ETH)', async () => {
    const txHistory = [
      makeTx({ value: 200000000000000000000n }), // 200 ETH
    ];

    const adapter = createMockAdapter({
      getBalance: vi.fn().mockResolvedValue(500000000000000000000n), // 500 ETH
      getTransactionHistory: vi.fn().mockResolvedValue(txHistory),
    });

    const result = await analyzeWallet('0xWhale', adapter);

    const whalePattern = result.patterns.find((p) => p.type === 'whale_activity');
    expect(whalePattern).toBeDefined();
    expect(whalePattern!.severity).toBe('info');
    expect(whalePattern!.description).toContain('Large transfers');
  });

  it('detects self-transfers (mixing pattern)', async () => {
    // > 20% self-transfers → danger
    const selfAddr = '0xMixer';
    const txHistory = [
      ...Array.from({ length: 4 }, (_, i) =>
        makeTx({
          hash: `0xself${i}`,
          from: selfAddr,
          to: selfAddr,
          timestamp: 1700000000 + i * 60,
        }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        makeTx({
          hash: `0xnormal${i}`,
          from: selfAddr,
          to: '0xOther',
          timestamp: 1700001000 + i * 60,
        }),
      ),
    ];

    const adapter = createMockAdapter({
      getTransactionHistory: vi.fn().mockResolvedValue(txHistory),
    });

    const result = await analyzeWallet(selfAddr, adapter);

    const selfPattern = result.patterns.find((p) => p.type === 'self_transfers');
    expect(selfPattern).toBeDefined();
    expect(selfPattern!.severity).toBe('danger');
    expect(selfPattern!.description).toContain('self-transfers');
  });

  it('detects contract-heavy interaction', async () => {
    // > 90% contract interactions with > 20 txs
    const txHistory = Array.from({ length: 25 }, (_, i) =>
      makeTx({
        hash: `0xcontract${i}`,
        timestamp: 1700000000 + i * 60,
        input: '0xa9059cbb' + '0'.repeat(128), // long input = contract call
      }),
    );

    const adapter = createMockAdapter({
      getTransactionHistory: vi.fn().mockResolvedValue(txHistory),
    });

    const result = await analyzeWallet('0xAutomated', adapter);

    const contractPattern = result.patterns.find((p) => p.type === 'contract_heavy');
    expect(contractPattern).toBeDefined();
    expect(contractPattern!.severity).toBe('warning');
    expect(contractPattern!.description).toContain('smart contracts');
  });

  it('calculates risk level as "flagged" for danger patterns', async () => {
    // Self-transfers with > 20% triggers danger → flagged
    const selfAddr = '0xFlaggedWallet';
    const txHistory = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeTx({
          hash: `0xself${i}`,
          from: selfAddr,
          to: selfAddr,
          timestamp: 1700000000 + i * 60,
        }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeTx({
          hash: `0xnormal${i}`,
          from: selfAddr,
          to: '0xOther',
          timestamp: 1700001000 + i * 60,
        }),
      ),
    ];

    const adapter = createMockAdapter({
      getTransactionHistory: vi.fn().mockResolvedValue(txHistory),
    });

    const result = await analyzeWallet(selfAddr, adapter);

    expect(result.riskLevel).toBe('flagged');
  });

  it('calculates risk level as "suspicious" for warning patterns only', async () => {
    // High failure rate (warning) but no danger patterns
    const txHistory = [
      ...generateTxHistory(5, { status: 'success' }),
      ...Array.from({ length: 8 }, (_, i) =>
        makeTx({
          hash: `0xfail${i}`,
          timestamp: 1700001000 + i * 60,
          status: 'reverted',
        }),
      ),
    ];

    const adapter = createMockAdapter({
      getTransactionHistory: vi.fn().mockResolvedValue(txHistory),
    });

    const result = await analyzeWallet('0xSuspicious', adapter);

    expect(result.riskLevel).toBe('suspicious');
  });

  it('integrates ML wallet behavior classification', async () => {
    const mlMock = {
      classifyWallet: vi.fn().mockResolvedValue({
        behavior_type: 'sniper',
        confidence: 0.85,
        risk_score: 0.7,
        secondary_type: null,
        indicators: ['rapid trades'],
        model: 'wallet-v1',
      }),
      detectAnomalies: vi.fn().mockResolvedValue([]),
    };

    vi.mocked(getMLClient).mockReturnValue(mlMock as unknown as ReturnType<typeof getMLClient>);

    const txHistory = generateTxHistory(5);
    const adapter = createMockAdapter({
      getTransactionHistory: vi.fn().mockResolvedValue(txHistory),
    });

    const result = await analyzeWallet('0xMLWallet', adapter);

    expect(result.mlBehavior).toBeDefined();
    expect(result.mlBehavior!.behavior_type).toBe('sniper');
    expect(result.mlBehavior!.risk_score).toBe(0.7);
    // ML risk_score > 0.6 should upgrade risk to 'flagged'
    expect(result.riskLevel).toBe('flagged');
  });

  it('ML risk_score > 0.3 upgrades clean to suspicious', async () => {
    const mlMock = {
      classifyWallet: vi.fn().mockResolvedValue({
        behavior_type: 'normal_trader',
        confidence: 0.6,
        risk_score: 0.4,
        secondary_type: null,
        indicators: [],
        model: 'wallet-v1',
      }),
      detectAnomalies: vi.fn().mockResolvedValue([]),
    };

    vi.mocked(getMLClient).mockReturnValue(mlMock as unknown as ReturnType<typeof getMLClient>);

    const txHistory = generateTxHistory(5); // clean patterns
    const adapter = createMockAdapter({
      getTransactionHistory: vi.fn().mockResolvedValue(txHistory),
    });

    const result = await analyzeWallet('0xMLSuspicious', adapter);

    expect(result.riskLevel).toBe('suspicious');
  });

  it('handles getBalance failure gracefully', async () => {
    const adapter = createMockAdapter({
      getBalance: vi.fn().mockRejectedValue(new Error('RPC error')),
      getTransactionHistory: vi.fn().mockResolvedValue([]),
    });

    const result = await analyzeWallet('0xBroken', adapter);

    expect(result.balance).toBe(0n);
    expect(result).toBeDefined();
  });

  it('handles getTransactionHistory failure gracefully', async () => {
    const adapter = createMockAdapter({
      getBalance: vi.fn().mockResolvedValue(1000n),
      getTransactionHistory: vi.fn().mockRejectedValue(new Error('RPC error')),
    });

    const result = await analyzeWallet('0xBroken', adapter);

    expect(result.transactionCount).toBe(0);
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]!.type).toBe('new_wallet');
  });

  it('returns complete WalletAnalysis structure', async () => {
    const adapter = createMockAdapter();
    const result = await analyzeWallet('0x1234', adapter);

    expect(typeof result.address).toBe('string');
    expect(typeof result.chain).toBe('string');
    expect(typeof result.balance).toBe('bigint');
    expect(typeof result.transactionCount).toBe('number');
    expect(Array.isArray(result.tokenBalances)).toBe(true);
    expect(Array.isArray(result.patterns)).toBe(true);
    expect(['clean', 'suspicious', 'flagged']).toContain(result.riskLevel);
  });

  it('ML failure does not break analysis', async () => {
    const mlMock = {
      classifyWallet: vi.fn().mockRejectedValue(new Error('ML sidecar down')),
      detectAnomalies: vi.fn().mockResolvedValue([]),
    };

    vi.mocked(getMLClient).mockReturnValue(mlMock as unknown as ReturnType<typeof getMLClient>);

    const txHistory = generateTxHistory(5);
    const adapter = createMockAdapter({
      getTransactionHistory: vi.fn().mockResolvedValue(txHistory),
    });

    const result = await analyzeWallet('0xMLDown', adapter);

    expect(result).toBeDefined();
    expect(result.mlBehavior).toBeUndefined();
    expect(result.riskLevel).toBe('clean');
  });
});
