import { describe, it, expect, vi } from 'vitest';
import { detectRugIndicators } from '@/core/forensics/rug-detector.js';
import type { ChainAdapter } from '@/chains/types.js';

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

describe('detectRugIndicators', () => {
  it('reports low risk for clean contracts', async () => {
    const adapter = createMockAdapter({
      getContractCode: vi.fn().mockResolvedValue('0x6080604052'),
    });

    const result = await detectRugIndicators('0x1234', adapter);
    expect(result.isHoneypot).toBe(false);
    expect(result.ownerCanMint).toBe(false);
    expect(result.ownerCanPause).toBe(false);
    expect(result.hasBlacklist).toBe(false);
    expect(result.riskScore).toBeLessThan(30);
  });

  it('detects no-code contracts as risky', async () => {
    const adapter = createMockAdapter({
      getContractCode: vi.fn().mockResolvedValue('0x'),
    });

    const result = await detectRugIndicators('0x1234', adapter);
    const noCodeDetail = result.details.find((d) => d.check === 'Contract Verified');
    expect(noCodeDetail?.passed).toBe(false);
  });

  it('handles getContractCode failure gracefully', async () => {
    const adapter = createMockAdapter({
      getContractCode: vi.fn().mockRejectedValue(new Error('RPC error')),
    });

    const result = await detectRugIndicators('0x1234', adapter);
    expect(result).toBeDefined();
    expect(result.details.length).toBeGreaterThan(0);
  });

  it('handles getTokenInfo failure gracefully', async () => {
    const adapter = createMockAdapter({
      getContractCode: vi.fn().mockResolvedValue('0x6080604052'),
      getTokenInfo: vi.fn().mockRejectedValue(new Error('Token not found')),
    });

    const result = await detectRugIndicators('0xbad', adapter);
    const tokenDetail = result.details.find((d) => d.check === 'Valid Token');
    expect(tokenDetail?.passed).toBe(false);
    expect(tokenDetail?.severity).toBe('critical');
  });

  it('risk score is between 0 and 100', async () => {
    const adapter = createMockAdapter();
    const result = await detectRugIndicators('0x1234', adapter);
    expect(result.riskScore).toBeGreaterThanOrEqual(0);
    expect(result.riskScore).toBeLessThanOrEqual(100);
  });

  it('returns complete RugIndicators structure', async () => {
    const adapter = createMockAdapter();
    const result = await detectRugIndicators('0x1234', adapter);

    expect(typeof result.isHoneypot).toBe('boolean');
    expect(typeof result.hasLiquidityLock).toBe('boolean');
    expect(typeof result.ownerCanMint).toBe('boolean');
    expect(typeof result.ownerCanPause).toBe('boolean');
    expect(typeof result.hasBlacklist).toBe('boolean');
    expect(typeof result.highSellTax).toBe('boolean');
    expect(typeof result.riskScore).toBe('number');
    expect(Array.isArray(result.details)).toBe(true);
  });
});
