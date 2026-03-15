import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChainAdapter, Holder } from '@/chains/types.js';

// ---------------------------------------------------------------------------
// Mock ML client
// ---------------------------------------------------------------------------

vi.mock('@/ml/client.js', () => ({
  getMLClient: vi.fn(() => null),
  initMLClient: vi.fn(),
}));

import { trackWhales } from '@/core/forensics/whale-tracker.js';
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
      totalSupply: 1_000_000_000_000_000_000_000_000n, // 1M tokens
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

const TOTAL_SUPPLY = 1_000_000_000_000_000_000_000_000n; // 1M tokens (18 decimals)

function makeHolder(address: string, pct: number): Holder {
  const balance = (TOTAL_SUPPLY * BigInt(Math.round(pct * 100))) / 10000n;
  return { address, balance, percentage: pct };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('trackWhales', () => {
  it('returns empty whale list for no holders', async () => {
    const adapter = createMockAdapter({
      getTopHolders: vi.fn().mockResolvedValue([]),
    });

    const result = await trackWhales('0xToken', adapter);

    expect(result.tokenAddress).toBe('0xToken');
    expect(result.chain).toBe('ethereum');
    expect(result.whales).toHaveLength(0);
    expect(result.whaleConcentration).toBe(0);
    expect(result.risk).toBe('low');
  });

  it('calculates whale concentration percentages correctly', async () => {
    const holders: Holder[] = [
      makeHolder('0xWhale1', 15),
      makeHolder('0xWhale2', 10),
      makeHolder('0xWhale3', 5),
    ];

    const adapter = createMockAdapter({
      getTopHolders: vi.fn().mockResolvedValue(holders),
    });

    const result = await trackWhales('0xToken', adapter);

    expect(result.whales).toHaveLength(3);
    expect(result.whales[0]!.address).toBe('0xWhale1');
    // Percentage should be approximately 15%
    expect(result.whales[0]!.percentageOfSupply).toBeCloseTo(15, 0);
    expect(result.whales[1]!.percentageOfSupply).toBeCloseTo(10, 0);
    expect(result.whales[2]!.percentageOfSupply).toBeCloseTo(5, 0);
  });

  it('assesses low risk when concentration <= 40%', async () => {
    const holders: Holder[] = [
      makeHolder('0xA', 10),
      makeHolder('0xB', 8),
      makeHolder('0xC', 5),
      makeHolder('0xD', 3),
    ];

    const adapter = createMockAdapter({
      getTopHolders: vi.fn().mockResolvedValue(holders),
    });

    const result = await trackWhales('0xToken', adapter);

    expect(result.whaleConcentration).toBeLessThanOrEqual(40);
    expect(result.risk).toBe('low');
  });

  it('assesses medium risk when concentration > 40% and <= 70%', async () => {
    const holders: Holder[] = [makeHolder('0xA', 20), makeHolder('0xB', 15), makeHolder('0xC', 10)];

    const adapter = createMockAdapter({
      getTopHolders: vi.fn().mockResolvedValue(holders),
    });

    const result = await trackWhales('0xToken', adapter);

    expect(result.whaleConcentration).toBeGreaterThan(40);
    expect(result.whaleConcentration).toBeLessThanOrEqual(70);
    expect(result.risk).toBe('medium');
  });

  it('assesses high risk when concentration > 70%', async () => {
    const holders: Holder[] = [makeHolder('0xA', 40), makeHolder('0xB', 25), makeHolder('0xC', 10)];

    const adapter = createMockAdapter({
      getTopHolders: vi.fn().mockResolvedValue(holders),
    });

    const result = await trackWhales('0xToken', adapter);

    expect(result.whaleConcentration).toBeGreaterThan(70);
    expect(result.risk).toBe('high');
  });

  it('handles single dominant holder (> 50%)', async () => {
    const holders: Holder[] = [makeHolder('0xDominant', 55)];

    const adapter = createMockAdapter({
      getTopHolders: vi.fn().mockResolvedValue(holders),
    });

    const result = await trackWhales('0xToken', adapter);

    expect(result.whales).toHaveLength(1);
    expect(result.whales[0]!.percentageOfSupply).toBeGreaterThan(50);
    expect(result.whaleConcentration).toBeGreaterThan(50);
    expect(result.risk).toBe('medium'); // 55% is > 40 but <= 70
  });

  it('single holder with > 70% is high risk', async () => {
    const holders: Holder[] = [makeHolder('0xDominant', 80)];

    const adapter = createMockAdapter({
      getTopHolders: vi.fn().mockResolvedValue(holders),
    });

    const result = await trackWhales('0xToken', adapter);

    expect(result.whales).toHaveLength(1);
    expect(result.whaleConcentration).toBeGreaterThan(70);
    expect(result.risk).toBe('high');
  });

  it('defaults recentActivity to "unknown" without ML', async () => {
    const holders: Holder[] = [makeHolder('0xA', 10)];

    const adapter = createMockAdapter({
      getTopHolders: vi.fn().mockResolvedValue(holders),
    });

    const result = await trackWhales('0xToken', adapter);

    expect(result.whales[0]!.recentActivity).toBe('unknown');
  });

  it('integrates ML classification for whale activity', async () => {
    const mlMock = {
      classifyWallet: vi.fn().mockResolvedValue({
        behavior_type: 'whale',
        confidence: 0.9,
        risk_score: 0.2,
        secondary_type: null,
        indicators: ['large holdings'],
        model: 'wallet-v1',
      }),
      detectAnomalies: vi.fn().mockResolvedValue([]),
    };

    vi.mocked(getMLClient).mockReturnValue(mlMock as unknown as ReturnType<typeof getMLClient>);

    const holders: Holder[] = [makeHolder('0xWhale', 15)];
    const adapter = createMockAdapter({
      getTopHolders: vi.fn().mockResolvedValue(holders),
    });

    const result = await trackWhales('0xToken', adapter);

    expect(mlMock.classifyWallet).toHaveBeenCalled();
    // 'whale' maps to 'holding'
    expect(result.whales[0]!.recentActivity).toBe('holding');
  });

  it('ML classify "sniper" maps to "accumulating"', async () => {
    const mlMock = {
      classifyWallet: vi.fn().mockResolvedValue({
        behavior_type: 'sniper',
        confidence: 0.8,
        risk_score: 0.5,
        secondary_type: null,
        indicators: [],
        model: 'wallet-v1',
      }),
      detectAnomalies: vi.fn().mockResolvedValue([]),
    };

    vi.mocked(getMLClient).mockReturnValue(mlMock as unknown as ReturnType<typeof getMLClient>);

    const holders: Holder[] = [makeHolder('0xSniper', 10)];
    const adapter = createMockAdapter({
      getTopHolders: vi.fn().mockResolvedValue(holders),
    });

    const result = await trackWhales('0xToken', adapter);

    expect(result.whales[0]!.recentActivity).toBe('accumulating');
  });

  it('ML classify "mixer_user" maps to "distributing"', async () => {
    const mlMock = {
      classifyWallet: vi.fn().mockResolvedValue({
        behavior_type: 'mixer_user',
        confidence: 0.7,
        risk_score: 0.6,
        secondary_type: null,
        indicators: [],
        model: 'wallet-v1',
      }),
      detectAnomalies: vi.fn().mockResolvedValue([]),
    };

    vi.mocked(getMLClient).mockReturnValue(mlMock as unknown as ReturnType<typeof getMLClient>);

    const holders: Holder[] = [makeHolder('0xMixer', 8)];
    const adapter = createMockAdapter({
      getTopHolders: vi.fn().mockResolvedValue(holders),
    });

    const result = await trackWhales('0xToken', adapter);

    expect(result.whales[0]!.recentActivity).toBe('distributing');
  });

  it('ML anomaly detection reports anomalies in whale flows', async () => {
    const mlMock = {
      classifyWallet: vi.fn().mockResolvedValue(null),
      detectAnomalies: vi.fn().mockResolvedValue([
        {
          symbol: '0xToken',
          score: 0.95,
          isAnomaly: true,
          type: 'whale_transfer',
          details: 'Unusually large transfer detected',
        },
        {
          symbol: '0xToken',
          score: 0.2,
          isAnomaly: false,
          type: 'unknown',
          details: 'Normal transfer',
        },
      ]),
    };

    vi.mocked(getMLClient).mockReturnValue(mlMock as unknown as ReturnType<typeof getMLClient>);

    const holders: Holder[] = [makeHolder('0xA', 20)];
    const adapter = createMockAdapter({
      getTopHolders: vi.fn().mockResolvedValue(holders),
    });

    const result = await trackWhales('0xToken', adapter);

    expect(result.anomalies).toBeDefined();
    expect(result.anomalies).toHaveLength(1); // only isAnomaly=true are kept
    expect(result.anomalies![0]!.type).toBe('whale_transfer');
  });

  it('does not include anomalies when none are flagged', async () => {
    const mlMock = {
      classifyWallet: vi.fn().mockResolvedValue(null),
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

    const holders: Holder[] = [makeHolder('0xA', 10)];
    const adapter = createMockAdapter({
      getTopHolders: vi.fn().mockResolvedValue(holders),
    });

    const result = await trackWhales('0xToken', adapter);

    // No isAnomaly=true, so filtered list is empty → anomalies not set
    expect(result.anomalies).toBeUndefined();
  });

  it('handles getTokenInfo failure gracefully', async () => {
    const adapter = createMockAdapter({
      getTokenInfo: vi.fn().mockRejectedValue(new Error('Token not found')),
      getTopHolders: vi
        .fn()
        .mockResolvedValue([{ address: '0xA', balance: 1000n, percentage: 10 }]),
    });

    const result = await trackWhales('0xBadToken', adapter);

    expect(result).toBeDefined();
    // totalSupply defaults to 0n, so percentages will be 0
    expect(result.whales[0]!.percentageOfSupply).toBe(0);
    expect(result.risk).toBe('low');
  });

  it('handles getTopHolders failure gracefully', async () => {
    const adapter = createMockAdapter({
      getTopHolders: vi.fn().mockRejectedValue(new Error('API error')),
    });

    const result = await trackWhales('0xToken', adapter);

    expect(result.whales).toHaveLength(0);
    expect(result.whaleConcentration).toBe(0);
    expect(result.risk).toBe('low');
  });

  it('ML failure does not break whale tracking', async () => {
    const mlMock = {
      classifyWallet: vi.fn().mockRejectedValue(new Error('ML sidecar down')),
      detectAnomalies: vi.fn().mockRejectedValue(new Error('ML sidecar down')),
    };

    vi.mocked(getMLClient).mockReturnValue(mlMock as unknown as ReturnType<typeof getMLClient>);

    const holders: Holder[] = [makeHolder('0xA', 10), makeHolder('0xB', 15)];
    const adapter = createMockAdapter({
      getTopHolders: vi.fn().mockResolvedValue(holders),
    });

    const result = await trackWhales('0xToken', adapter);

    expect(result).toBeDefined();
    expect(result.whales).toHaveLength(2);
    // recentActivity stays 'unknown' when ML fails
    expect(result.whales[0]!.recentActivity).toBe('unknown');
    expect(result.whales[1]!.recentActivity).toBe('unknown');
    expect(result.anomalies).toBeUndefined();
  });

  it('returns complete WhaleReport structure', async () => {
    const holders: Holder[] = [makeHolder('0xA', 10)];
    const adapter = createMockAdapter({
      getTopHolders: vi.fn().mockResolvedValue(holders),
    });

    const result = await trackWhales('0xToken', adapter);

    expect(typeof result.tokenAddress).toBe('string');
    expect(typeof result.chain).toBe('string');
    expect(Array.isArray(result.whales)).toBe(true);
    expect(typeof result.whaleConcentration).toBe('number');
    expect(['low', 'medium', 'high']).toContain(result.risk);
  });
});
