import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChainAdapter, TokenTransfer } from '@/chains/types.js';

// ---------------------------------------------------------------------------
// Mock ML client
// ---------------------------------------------------------------------------

vi.mock('@/ml/client.js', () => ({
  getMLClient: vi.fn(() => null),
  initMLClient: vi.fn(),
}));

import { analyzeTokenFlows } from '@/core/forensics/token-flow.js';
import { getMLClient } from '@/ml/client.js';

// ---------------------------------------------------------------------------
// Mock chain adapter
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
      address: '0xToken',
      name: 'TestToken',
      symbol: 'TEST',
      decimals: 18,
      totalSupply: 1_000_000_000_000_000_000_000_000n,
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

function makeTransfer(overrides: Partial<TokenTransfer> = {}): TokenTransfer {
  return {
    hash: '0xabc',
    blockNumber: 18000000n,
    from: '0xSender',
    to: '0xReceiver',
    value: 1_000_000_000_000_000_000n, // 1 token (18 decimals)
    tokenAddress: '0xToken',
    tokenSymbol: 'TEST',
    tokenDecimals: 18,
    timestamp: 1700000000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('analyzeTokenFlows', () => {
  it('handles empty transfer list', async () => {
    const adapter = createMockAdapter({
      getTokenTransfers: vi.fn().mockResolvedValue([]),
    });

    const result = await analyzeTokenFlows('0xToken', '0xTarget', adapter);

    expect(result.totalInflow).toBe(0n);
    expect(result.totalOutflow).toBe(0n);
    expect(result.uniqueSenders).toBe(0);
    expect(result.uniqueReceivers).toBe(0);
    expect(result.largestTransfer).toBeNull();
    expect(result.flows).toHaveLength(0);
  });

  it('calculates inflow for transfers TO the target address', async () => {
    const targetAddr = '0xTarget';
    const transfers: TokenTransfer[] = [
      makeTransfer({ from: '0xA', to: targetAddr, value: 100n }),
      makeTransfer({ from: '0xB', to: targetAddr, value: 200n }),
      makeTransfer({ from: '0xC', to: '0xOther', value: 500n }), // not to target
    ];

    const adapter = createMockAdapter({
      getTokenTransfers: vi.fn().mockResolvedValue(transfers),
    });

    const result = await analyzeTokenFlows('0xToken', targetAddr, adapter);

    expect(result.totalInflow).toBe(300n); // 100 + 200
  });

  it('calculates outflow for transfers FROM the target address', async () => {
    const targetAddr = '0xTarget';
    const transfers: TokenTransfer[] = [
      makeTransfer({ from: targetAddr, to: '0xA', value: 50n }),
      makeTransfer({ from: targetAddr, to: '0xB', value: 150n }),
      makeTransfer({ from: '0xOther', to: '0xC', value: 1000n }), // not from target
    ];

    const adapter = createMockAdapter({
      getTokenTransfers: vi.fn().mockResolvedValue(transfers),
    });

    const result = await analyzeTokenFlows('0xToken', targetAddr, adapter);

    expect(result.totalOutflow).toBe(200n); // 50 + 150
  });

  it('handles case-insensitive address matching for inflow/outflow', async () => {
    const transfers: TokenTransfer[] = [
      makeTransfer({ from: '0xabc', to: '0xTARGET', value: 100n }),
      makeTransfer({ from: '0xtarget', to: '0xDest', value: 50n }),
    ];

    const adapter = createMockAdapter({
      getTokenTransfers: vi.fn().mockResolvedValue(transfers),
    });

    const result = await analyzeTokenFlows('0xToken', '0xTarget', adapter);

    expect(result.totalInflow).toBe(100n);
    expect(result.totalOutflow).toBe(50n);
  });

  it('detects largest transfer', async () => {
    const transfers: TokenTransfer[] = [
      makeTransfer({ hash: '0x1', from: '0xA', to: '0xB', value: 100n }),
      makeTransfer({ hash: '0x2', from: '0xC', to: '0xD', value: 999n }),
      makeTransfer({ hash: '0x3', from: '0xE', to: '0xF', value: 50n }),
    ];

    const adapter = createMockAdapter({
      getTokenTransfers: vi.fn().mockResolvedValue(transfers),
    });

    const result = await analyzeTokenFlows('0xToken', '0xTarget', adapter);

    expect(result.largestTransfer).not.toBeNull();
    expect(result.largestTransfer!.amount).toBe(999n);
  });

  it('counts unique senders correctly', async () => {
    const transfers: TokenTransfer[] = [
      makeTransfer({ from: '0xA', to: '0xX' }),
      makeTransfer({ from: '0xA', to: '0xY' }), // duplicate sender
      makeTransfer({ from: '0xB', to: '0xZ' }),
      makeTransfer({ from: '0xC', to: '0xX' }),
    ];

    const adapter = createMockAdapter({
      getTokenTransfers: vi.fn().mockResolvedValue(transfers),
    });

    const result = await analyzeTokenFlows('0xToken', '0xTarget', adapter);

    expect(result.uniqueSenders).toBe(3); // 0xA, 0xB, 0xC
  });

  it('counts unique receivers correctly', async () => {
    const transfers: TokenTransfer[] = [
      makeTransfer({ from: '0xA', to: '0xX' }),
      makeTransfer({ from: '0xB', to: '0xX' }), // duplicate receiver
      makeTransfer({ from: '0xC', to: '0xY' }),
    ];

    const adapter = createMockAdapter({
      getTokenTransfers: vi.fn().mockResolvedValue(transfers),
    });

    const result = await analyzeTokenFlows('0xToken', '0xTarget', adapter);

    expect(result.uniqueReceivers).toBe(2); // 0xX, 0xY
  });

  it('returns flows array matching transfer count', async () => {
    const transfers: TokenTransfer[] = [
      makeTransfer({ hash: '0x1' }),
      makeTransfer({ hash: '0x2' }),
      makeTransfer({ hash: '0x3' }),
    ];

    const adapter = createMockAdapter({
      getTokenTransfers: vi.fn().mockResolvedValue(transfers),
    });

    const result = await analyzeTokenFlows('0xToken', '0xTarget', adapter);

    expect(result.flows).toHaveLength(3);
    expect(result.flows[0]!.tokenAddress).toBe('0xToken');
  });

  it('maps transfer fields to TokenFlow correctly', async () => {
    const transfers: TokenTransfer[] = [
      makeTransfer({
        from: '0xSender',
        to: '0xReceiver',
        value: 42n,
        tokenAddress: '0xToken',
        blockNumber: 18500000n,
        timestamp: 1700001234,
      }),
    ];

    const adapter = createMockAdapter({
      getTokenTransfers: vi.fn().mockResolvedValue(transfers),
    });

    const result = await analyzeTokenFlows('0xToken', '0xTarget', adapter);
    const flow = result.flows[0]!;

    expect(flow.from).toBe('0xSender');
    expect(flow.to).toBe('0xReceiver');
    expect(flow.amount).toBe(42n);
    expect(flow.tokenAddress).toBe('0xToken');
    expect(flow.blockNumber).toBe(18500000n);
    expect(flow.timestamp).toBe(1700001234);
  });

  it('handles transfer with undefined timestamp', async () => {
    const transfer = {
      hash: '0xnotime',
      blockNumber: 18000000n,
      from: '0xA',
      to: '0xB',
      value: 100n,
      tokenAddress: '0xToken',
      tokenSymbol: 'TEST',
      tokenDecimals: 18,
      // timestamp intentionally omitted
    } as unknown as TokenTransfer;

    const adapter = createMockAdapter({
      getTokenTransfers: vi.fn().mockResolvedValue([transfer]),
    });

    const result = await analyzeTokenFlows('0xToken', '0xTarget', adapter);

    expect(result.flows[0]!.timestamp).toBeNull();
  });

  it('integrates ML anomaly detection on flows', async () => {
    const mlMock = {
      detectAnomalies: vi.fn().mockResolvedValue([
        {
          symbol: '0xToken',
          score: 0.92,
          isAnomaly: true,
          type: 'whale_transfer',
          details: 'Massive outflow detected',
        },
        {
          symbol: '0xToken',
          score: 0.15,
          isAnomaly: false,
          type: 'unknown',
          details: 'Normal transfer',
        },
      ]),
    };

    vi.mocked(getMLClient).mockReturnValue(mlMock as unknown as ReturnType<typeof getMLClient>);

    const transfers: TokenTransfer[] = [
      makeTransfer({ from: '0xA', to: '0xB', value: 1_000_000n }),
    ];

    const adapter = createMockAdapter({
      getTokenTransfers: vi.fn().mockResolvedValue(transfers),
    });

    const result = await analyzeTokenFlows('0xToken', '0xTarget', adapter);

    expect(mlMock.detectAnomalies).toHaveBeenCalled();
    expect(result.anomalies).toBeDefined();
    expect(result.anomalies).toHaveLength(1); // only isAnomaly=true
    expect(result.anomalies![0]!.type).toBe('whale_transfer');
    expect(result.anomalies![0]!.score).toBe(0.92);
  });

  it('does not include anomalies when none are flagged', async () => {
    const mlMock = {
      detectAnomalies: vi.fn().mockResolvedValue([
        {
          symbol: '0xToken',
          score: 0.1,
          isAnomaly: false,
          type: 'unknown',
          details: 'Normal',
        },
      ]),
    };

    vi.mocked(getMLClient).mockReturnValue(mlMock as unknown as ReturnType<typeof getMLClient>);

    const transfers: TokenTransfer[] = [makeTransfer()];
    const adapter = createMockAdapter({
      getTokenTransfers: vi.fn().mockResolvedValue(transfers),
    });

    const result = await analyzeTokenFlows('0xToken', '0xTarget', adapter);

    // No isAnomaly=true results → anomalies should be empty
    expect(result.anomalies).toEqual([]);
  });

  it('does not call ML when transfer list is empty', async () => {
    const mlMock = {
      detectAnomalies: vi.fn().mockResolvedValue([]),
    };

    vi.mocked(getMLClient).mockReturnValue(mlMock as unknown as ReturnType<typeof getMLClient>);

    const adapter = createMockAdapter({
      getTokenTransfers: vi.fn().mockResolvedValue([]),
    });

    const result = await analyzeTokenFlows('0xToken', '0xTarget', adapter);

    expect(mlMock.detectAnomalies).not.toHaveBeenCalled();
    expect(result.anomalies).toBeUndefined();
  });

  it('ML failure does not break flow analysis', async () => {
    const mlMock = {
      detectAnomalies: vi.fn().mockRejectedValue(new Error('ML sidecar down')),
    };

    vi.mocked(getMLClient).mockReturnValue(mlMock as unknown as ReturnType<typeof getMLClient>);

    const transfers: TokenTransfer[] = [makeTransfer({ from: '0xA', to: '0xB', value: 500n })];

    const adapter = createMockAdapter({
      getTokenTransfers: vi.fn().mockResolvedValue(transfers),
    });

    const result = await analyzeTokenFlows('0xToken', '0xTarget', adapter);

    expect(result).toBeDefined();
    expect(result.flows).toHaveLength(1);
    expect(result.anomalies).toBeUndefined();
  });

  it('handles getTokenTransfers failure', async () => {
    const adapter = createMockAdapter({
      getTokenTransfers: vi.fn().mockRejectedValue(new Error('RPC error')),
    });

    await expect(analyzeTokenFlows('0xToken', '0xTarget', adapter)).rejects.toThrow('RPC error');
  });

  it('returns complete FlowAnalysis structure', async () => {
    const transfers: TokenTransfer[] = [makeTransfer()];
    const adapter = createMockAdapter({
      getTokenTransfers: vi.fn().mockResolvedValue(transfers),
    });

    const result = await analyzeTokenFlows('0xToken', '0xTarget', adapter);

    expect(typeof result.totalInflow).toBe('bigint');
    expect(typeof result.totalOutflow).toBe('bigint');
    expect(typeof result.uniqueSenders).toBe('number');
    expect(typeof result.uniqueReceivers).toBe('number');
    expect(Array.isArray(result.flows)).toBe(true);
  });
});
