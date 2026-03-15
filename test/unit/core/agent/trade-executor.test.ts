import { describe, it, expect, vi } from 'vitest';
import type { WritableChainAdapter } from '@/chains/types.js';

// ---------------------------------------------------------------------------
// Track the swap/weth mocks across tests
// ---------------------------------------------------------------------------
const mockSwap = vi.fn();
const mockGetWethAddress = vi.fn().mockReturnValue('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');

// Mock the DexRouter before importing TradeExecutor
vi.mock('@/core/agent/dex/router.js', () => {
  return {
    DexRouter: vi.fn(function (this: Record<string, unknown>) {
      this.getWethAddress = mockGetWethAddress;
      this.swap = mockSwap;
    }),
  };
});

import { TradeExecutor } from '@/core/agent/trade-executor.js';
import type { TradeConfig } from '@/core/agent/trade-executor.js';

function freshAdapter(): WritableChainAdapter {
  return {
    chainId: 'ethereum',
    name: 'Ethereum',
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
    getBalance: vi.fn(),
    getTokenBalance: vi.fn(),
    getTransactionHistory: vi.fn(),
    getTokenTransfers: vi.fn(),
    getContractCode: vi.fn(),
    readContract: vi.fn(),
    getContractEvents: vi.fn(),
    getTokenInfo: vi.fn(),
    getTopHolders: vi.fn(),
    getBlockNumber: vi.fn(),
    getBlock: vi.fn(),
    sendTransaction: vi.fn().mockResolvedValue({
      hash: '0xabc',
      status: 'success',
      blockNumber: 1n,
      gasUsed: 21000n,
      effectiveGasPrice: 20000000000n,
      logs: [],
    }),
    writeContract: vi.fn().mockResolvedValue({
      hash: '0xdef',
      status: 'success',
      blockNumber: 1n,
      gasUsed: 50000n,
      effectiveGasPrice: 20000000000n,
      logs: [],
    }),
    signMessage: vi.fn().mockResolvedValue('0xsig'),
    estimateGas: vi.fn().mockResolvedValue(21000n),
  };
}

function resetSwapMock(): void {
  mockSwap.mockReset();
  mockSwap.mockResolvedValue({
    receipt: {
      hash: '0xswaphash',
      blockNumber: 100n,
      status: 'success',
      gasUsed: 80000n,
      effectiveGasPrice: 20000000000n,
      logs: [],
    },
    amountIn: 1000000000000000000n,
    tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    tokenOut: '0xTokenAddress',
  });
}

describe('TradeExecutor', () => {
  describe('dry-run mode (default)', () => {
    it('executeBuy returns success with dryRun: true', async () => {
      const adapter = freshAdapter();
      const executor = new TradeExecutor(adapter, { dryRun: true });

      const result = await executor.executeBuy(
        '0xTokenAddress',
        1000000000000000000n,
        '0xRecipient',
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('buy');
      expect(result.dryRun).toBe(true);
      expect(result.symbol).toBe('0xTokenAddress');
      expect(result.amount).toBe(1000000000000000000n);
      expect(result.txHash).toBeUndefined();
      expect(result.error).toBeUndefined();
      // Should NOT call any adapter write methods
      expect(adapter.estimateGas).not.toHaveBeenCalled();
      expect(adapter.writeContract).not.toHaveBeenCalled();
    });

    it('executeSell returns success with dryRun: true', async () => {
      const adapter = freshAdapter();
      const executor = new TradeExecutor(adapter, { dryRun: true });

      const result = await executor.executeSell(
        '0xTokenAddress',
        500000000000000000n,
        '0xRecipient',
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('sell');
      expect(result.dryRun).toBe(true);
      expect(result.symbol).toBe('0xTokenAddress');
      expect(result.amount).toBe(500000000000000000n);
      expect(result.txHash).toBeUndefined();
      expect(result.error).toBeUndefined();
      expect(adapter.estimateGas).not.toHaveBeenCalled();
      expect(adapter.writeContract).not.toHaveBeenCalled();
    });
  });

  describe('live mode', () => {
    it('executeBuy calls adapter.estimateGas and router.swap', async () => {
      resetSwapMock();
      const adapter = freshAdapter();
      const executor = new TradeExecutor(adapter, { dryRun: false });

      const result = await executor.executeBuy(
        '0xTokenAddress',
        1000000000000000000n,
        '0xRecipient',
      );

      expect(result.dryRun).toBe(false);
      expect(result.action).toBe('buy');
      expect(result.success).toBe(true);
      expect(result.txHash).toBe('0xswaphash');
      // estimateGas must be called for buy orders
      expect(adapter.estimateGas).toHaveBeenCalled();
      // DexRouter.swap must be called
      expect(mockSwap).toHaveBeenCalledWith({
        tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        tokenOut: '0xTokenAddress',
        amountIn: 1000000000000000000n,
        slippageBps: 50,
        recipient: '0xRecipient',
      });
    });

    it('executeSell calls router.swap', async () => {
      resetSwapMock();
      mockSwap.mockResolvedValue({
        receipt: {
          hash: '0xsellhash',
          blockNumber: 101n,
          status: 'success',
          gasUsed: 75000n,
          effectiveGasPrice: 20000000000n,
          logs: [],
        },
        amountIn: 500000000000000000n,
        tokenIn: '0xTokenAddress',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      });
      const adapter = freshAdapter();
      const executor = new TradeExecutor(adapter, { dryRun: false });

      const result = await executor.executeSell(
        '0xTokenAddress',
        500000000000000000n,
        '0xRecipient',
      );

      expect(result.dryRun).toBe(false);
      expect(result.action).toBe('sell');
      expect(result.success).toBe(true);
      expect(result.txHash).toBe('0xsellhash');
      expect(mockSwap).toHaveBeenCalledWith({
        tokenIn: '0xTokenAddress',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: 500000000000000000n,
        slippageBps: 50,
        recipient: '0xRecipient',
      });
    });

    it('executeBuy returns error result on swap failure', async () => {
      resetSwapMock();
      mockSwap.mockRejectedValue(new Error('insufficient liquidity'));
      const adapter = freshAdapter();
      const executor = new TradeExecutor(adapter, { dryRun: false });

      const result = await executor.executeBuy(
        '0xTokenAddress',
        1000000000000000000n,
        '0xRecipient',
      );

      expect(result.success).toBe(false);
      expect(result.action).toBe('buy');
      expect(result.dryRun).toBe(false);
      expect(result.error).toBe('insufficient liquidity');
      expect(result.txHash).toBeUndefined();
    });
  });

  describe('config', () => {
    it('default config has dryRun: true', async () => {
      const adapter = freshAdapter();
      const executor = new TradeExecutor(adapter);

      const result = await executor.executeBuy('0xTokenAddress', 1000n, '0xRecipient');

      expect(result.dryRun).toBe(true);
      expect(result.success).toBe(true);
      expect(adapter.estimateGas).not.toHaveBeenCalled();
    });

    it('custom config overrides defaults', async () => {
      resetSwapMock();
      const adapter = freshAdapter();
      const customConfig: Partial<TradeConfig> = {
        maxSlippageBps: 100,
        gasMultiplier: 1.5,
        dryRun: false,
        confirmBeforeExecute: false,
      };
      const executor = new TradeExecutor(adapter, customConfig);

      const result = await executor.executeBuy(
        '0xTokenAddress',
        2000000000000000000n,
        '0xRecipient',
      );

      expect(result.dryRun).toBe(false);
      expect(result.success).toBe(true);
      expect(mockSwap).toHaveBeenCalledWith(expect.objectContaining({ slippageBps: 100 }));
    });
  });
});
