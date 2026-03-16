// ---------------------------------------------------------------------------
// DEX router — Uniswap V3 swap integration with quoter
// ---------------------------------------------------------------------------

import type { WritableChainAdapter, TransactionReceipt } from '../../../chains/types.js';
import { SWAP_ROUTER_ABI, SWAP_ROUTER_ADDRESSES, WETH_ADDRESSES } from './abi/swap-router.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('dex-router');

// ---------------------------------------------------------------------------
// Quoter V2 ABI (quoteExactInputSingle only)
// ---------------------------------------------------------------------------

const QUOTER_V2_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'quoteExactInputSingle',
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// Uniswap Quoter V2 addresses (same across most EVM chains)
const QUOTER_V2_ADDRESSES: Record<string, string> = {
  // Mainnet
  ethereum: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  polygon: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  arbitrum: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  optimism: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  base: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
  // Testnets
  sepolia: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3',
  'arbitrum-sepolia': '0x2779a0CC1c3e0E44D2542EC3e79e3864Ae93Ef0B',
  'base-sepolia': '0xC5290058841028F1614F3A6F0F5816cAd0df5E27',
  'optimism-sepolia': '0xC5290058841028F1614F3A6F0F5816cAd0df5E27',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  slippageBps: number; // basis points, e.g. 50 = 0.5%
  fee?: number; // Uniswap pool fee tier (default: 3000 = 0.3%)
  recipient: string;
}

export interface QuoteParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  fee?: number;
}

export interface SwapResult {
  receipt: TransactionReceipt;
  amountIn: bigint;
  tokenIn: string;
  tokenOut: string;
}

// ---------------------------------------------------------------------------
// DexRouter
// ---------------------------------------------------------------------------

export class DexRouter {
  private adapter: WritableChainAdapter;

  constructor(adapter: WritableChainAdapter) {
    this.adapter = adapter;
  }

  /**
   * Get a quote for a swap using the Uniswap V3 Quoter V2 contract.
   * Returns the expected output amount.
   */
  async quote(params: QuoteParams): Promise<bigint> {
    const quoterAddress = QUOTER_V2_ADDRESSES[this.adapter.chainId];
    if (!quoterAddress) {
      throw new Error(`No quoter address for chain: ${this.adapter.chainId}`);
    }

    const fee = params.fee ?? 3000;

    log.info(
      `Quoting ${params.amountIn} ${params.tokenIn} → ${params.tokenOut} (fee tier: ${fee})`,
    );

    const result = await this.adapter.readContract(
      quoterAddress,
      QUOTER_V2_ABI,
      'quoteExactInputSingle',
      [
        {
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          amountIn: params.amountIn,
          fee,
          sqrtPriceLimitX96: 0n,
        },
      ],
    );

    // The result may be a single value or a tuple depending on the adapter
    let amountOut: bigint;
    if (typeof result === 'bigint') {
      amountOut = result;
    } else if (Array.isArray(result) && typeof result[0] === 'bigint') {
      amountOut = result[0];
    } else {
      throw new Error(`Unexpected quoter response format: ${String(result)}`);
    }

    log.info(`Quote result: ${amountOut} output tokens`);
    return amountOut;
  }

  async swap(params: SwapParams): Promise<SwapResult> {
    const routerAddress = SWAP_ROUTER_ADDRESSES[this.adapter.chainId];
    if (!routerAddress) {
      throw new Error(`No swap router for chain: ${this.adapter.chainId}`);
    }

    const fee = params.fee ?? 3000;

    // Get a real quote for slippage protection
    const amountOutMinimum = await (async (): Promise<bigint> => {
      try {
        const quotedAmount = await this.quote({
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          amountIn: params.amountIn,
          fee,
        });

        // Apply slippage tolerance: amountOutMinimum = quotedAmount * (1 - slippageBps/10000)
        const minimum = (quotedAmount * (10000n - BigInt(params.slippageBps))) / 10000n;

        log.info(
          `Slippage protection: quoted=${quotedAmount} minimum=${minimum} ` +
            `(${params.slippageBps}bps tolerance)`,
        );
        return minimum;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`Quoter call failed, falling back to amountOutMinimum=0: ${message}`);
        return 0n;
      }
    })();

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

  getRouterAddress(): string {
    const router = SWAP_ROUTER_ADDRESSES[this.adapter.chainId];
    if (!router) throw new Error(`No swap router for chain: ${this.adapter.chainId}`);
    return router;
  }
}
