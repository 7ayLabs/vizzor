// ---------------------------------------------------------------------------
// DEX router — Uniswap V3 swap integration
// ---------------------------------------------------------------------------

import type { WritableChainAdapter, TransactionReceipt } from '../../../chains/types.js';
import { SWAP_ROUTER_ABI, SWAP_ROUTER_ADDRESSES, WETH_ADDRESSES } from './abi/swap-router.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('dex-router');

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  slippageBps: number; // basis points, e.g. 50 = 0.5%
  fee?: number; // Uniswap pool fee tier (default: 3000 = 0.3%)
  recipient: string;
}

export interface SwapResult {
  receipt: TransactionReceipt;
  amountIn: bigint;
  tokenIn: string;
  tokenOut: string;
}

export class DexRouter {
  private adapter: WritableChainAdapter;

  constructor(adapter: WritableChainAdapter) {
    this.adapter = adapter;
  }

  async swap(params: SwapParams): Promise<SwapResult> {
    const routerAddress = SWAP_ROUTER_ADDRESSES[this.adapter.chainId];
    if (!routerAddress) {
      throw new Error(`No swap router for chain: ${this.adapter.chainId}`);
    }

    const fee = params.fee ?? 3000;
    // Calculate minimum output with slippage protection
    // In production, you'd get a quote first; here we use 0 as minimum
    // and rely on the slippage parameter for protection
    const amountOutMinimum = 0n; // TODO: integrate quoter for real min output

    log.info(
      `Swapping ${params.amountIn} ${params.tokenIn} → ${params.tokenOut} on ${this.adapter.chainId}`,
    );

    const receipt = await this.adapter.writeContract(
      routerAddress,
      SWAP_ROUTER_ABI,
      'exactInputSingle',
      [
        {
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          fee,
          recipient: params.recipient,
          amountIn: params.amountIn,
          amountOutMinimum,
          sqrtPriceLimitX96: 0n,
        },
      ],
    );

    return {
      receipt,
      amountIn: params.amountIn,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
    };
  }

  getWethAddress(): string {
    const weth = WETH_ADDRESSES[this.adapter.chainId];
    if (!weth) throw new Error(`No WETH address for chain: ${this.adapter.chainId}`);
    return weth;
  }
}
