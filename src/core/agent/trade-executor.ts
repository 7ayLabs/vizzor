// ---------------------------------------------------------------------------
// Trade executor — connects portfolio decisions to on-chain execution
// ---------------------------------------------------------------------------

import type { WritableChainAdapter } from '../../chains/types.js';
import { DexRouter } from './dex/router.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('trade-executor');

export interface TradeConfig {
  maxSlippageBps: number; // default 50 (0.5%)
  gasMultiplier: number; // default 1.2
  dryRun: boolean;
  confirmBeforeExecute: boolean;
}

export interface TradeResult {
  success: boolean;
  action: 'buy' | 'sell';
  symbol: string;
  amount: bigint;
  txHash?: string;
  error?: string;
  dryRun: boolean;
}

const DEFAULT_CONFIG: TradeConfig = {
  maxSlippageBps: 50,
  gasMultiplier: 1.2,
  dryRun: true,
  confirmBeforeExecute: true,
};

export class TradeExecutor {
  private adapter: WritableChainAdapter;
  private router: DexRouter;
  private config: TradeConfig;

  constructor(adapter: WritableChainAdapter, config?: Partial<TradeConfig>) {
    this.adapter = adapter;
    this.router = new DexRouter(adapter);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async executeBuy(
    tokenAddress: string,
    amountIn: bigint,
    recipient: string,
  ): Promise<TradeResult> {
    const weth = this.router.getWethAddress();

    if (this.config.dryRun) {
      log.info(`[DRY RUN] Buy ${tokenAddress} with ${amountIn} native token`);
      return {
        success: true,
        action: 'buy',
        symbol: tokenAddress,
        amount: amountIn,
        dryRun: true,
      };
    }

    try {
      // Estimate gas first
      const gasEstimate = await this.adapter.estimateGas({
        to: this.router.getWethAddress(),
        value: amountIn,
      });
      const gasWithBuffer =
        (gasEstimate * BigInt(Math.round(this.config.gasMultiplier * 100))) / 100n;

      log.info(
        `Executing buy: ${tokenAddress}, gas estimate: ${gasEstimate} (with buffer: ${gasWithBuffer})`,
      );

      const result = await this.router.swap({
        tokenIn: weth,
        tokenOut: tokenAddress,
        amountIn,
        slippageBps: this.config.maxSlippageBps,
        recipient,
      });

      return {
        success: result.receipt.status === 'success',
        action: 'buy',
        symbol: tokenAddress,
        amount: amountIn,
        txHash: result.receipt.hash,
        dryRun: false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Buy failed: ${message}`);
      return {
        success: false,
        action: 'buy',
        symbol: tokenAddress,
        amount: amountIn,
        error: message,
        dryRun: false,
      };
    }
  }

  async executeSell(
    tokenAddress: string,
    amountIn: bigint,
    recipient: string,
  ): Promise<TradeResult> {
    const weth = this.router.getWethAddress();

    if (this.config.dryRun) {
      log.info(`[DRY RUN] Sell ${amountIn} of ${tokenAddress}`);
      return {
        success: true,
        action: 'sell',
        symbol: tokenAddress,
        amount: amountIn,
        dryRun: true,
      };
    }

    try {
      const result = await this.router.swap({
        tokenIn: tokenAddress,
        tokenOut: weth,
        amountIn,
        slippageBps: this.config.maxSlippageBps,
        recipient,
      });

      return {
        success: result.receipt.status === 'success',
        action: 'sell',
        symbol: tokenAddress,
        amount: amountIn,
        txHash: result.receipt.hash,
        dryRun: false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Sell failed: ${message}`);
      return {
        success: false,
        action: 'sell',
        symbol: tokenAddress,
        amount: amountIn,
        error: message,
        dryRun: false,
      };
    }
  }
}
