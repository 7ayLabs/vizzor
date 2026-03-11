// ---------------------------------------------------------------------------
// Vizzor tool definitions for AI tool-use (provider-agnostic)
// ---------------------------------------------------------------------------

import type { AITool } from './providers/types.js';

/**
 * Tool definitions that Vizzor exposes to AI providers during chat and
 * analysis sessions. Each tool maps to a concrete handler registered via
 * {@link setToolHandler} in the AI client.
 *
 * Uses the provider-agnostic {@link AITool} type (JSON Schema format).
 * Provider implementations convert to their SDK-specific format internally.
 */
export const VIZZOR_TOOLS: AITool[] = [
  {
    name: 'get_token_info',
    description:
      'Get on-chain token information including name, symbol, decimals, total supply, and top holders for a given contract address and chain.',
    input_schema: {
      type: 'object' as const,
      properties: {
        address: {
          type: 'string',
          description: 'The token contract address (e.g. 0x...).',
        },
        chain: {
          type: 'string',
          description: 'The blockchain to query (e.g. "ethereum", "bsc", "polygon", "arbitrum").',
        },
      },
      required: ['address', 'chain'],
    },
  },
  {
    name: 'analyze_wallet',
    description:
      'Analyze a wallet address for transaction patterns, token holdings, DeFi interactions, and behavioral signals such as accumulation or distribution phases.',
    input_schema: {
      type: 'object' as const,
      properties: {
        address: {
          type: 'string',
          description: 'The wallet address to analyze.',
        },
        chain: {
          type: 'string',
          description: 'The blockchain the wallet resides on (e.g. "ethereum", "bsc").',
        },
        depth: {
          type: 'number',
          description: 'How many recent transactions to inspect. Defaults to 100.',
        },
      },
      required: ['address', 'chain'],
    },
  },
  {
    name: 'check_rug_indicators',
    description:
      'Check a token for common rug pull indicators including honeypot detection, liquidity locks, ownership status, hidden mints, and holder concentration.',
    input_schema: {
      type: 'object' as const,
      properties: {
        address: {
          type: 'string',
          description: 'The token contract address to check.',
        },
        chain: {
          type: 'string',
          description: 'The blockchain the token is deployed on.',
        },
      },
      required: ['address', 'chain'],
    },
  },
  {
    name: 'get_market_data',
    description:
      'Get current market data for a token including price, 24h volume, market cap, price change percentages, and circulating supply.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: {
          type: 'string',
          description: 'The token ticker symbol (e.g. "ETH", "BTC", "UNI").',
        },
        currency: {
          type: 'string',
          description: 'The fiat currency for price quotes. Defaults to "usd".',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'search_upcoming_icos',
    description:
      'Search for upcoming ICOs, token launches, and fundraising rounds filtered by category and/or blockchain. Powered by DeFiLlama raises and Pump.fun launches.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description:
            'Filter by project category (e.g. "defi", "gaming", "infrastructure", "nft", "ai").',
        },
        chain: {
          type: 'string',
          description: 'Filter by blockchain (e.g. "ethereum", "solana", "bsc").',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return. Defaults to 10.',
        },
      },
      required: [],
    },
  },
  {
    name: 'search_token_dex',
    description:
      'Search for any token on decentralized exchanges via DexScreener. Returns real-time price, volume, liquidity, buy/sell counts, pair info. Works for all tokens including meme coins and newly launched tokens.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Token name, symbol, or contract address to search for.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_trending',
    description:
      'Get currently trending and hot tokens from DexScreener (boosted tokens) and CoinGecko trending combined. Shows what the market is excited about right now.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_crypto_news',
    description:
      'Get the latest crypto news with sentiment analysis for a specific token or the market in general. Powered by CryptoPanic.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: {
          type: 'string',
          description:
            'Token symbol to filter news for (e.g. "BTC", "ETH", "SOL"). Omit for general crypto news.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_raises',
    description:
      'Get recent crypto fundraising rounds, venture capital investments, and token launches. Powered by DeFiLlama raises data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description: 'Filter by sector/category (e.g. "defi", "infrastructure", "gaming").',
        },
        chain: {
          type: 'string',
          description: 'Filter by blockchain (e.g. "ethereum", "solana").',
        },
      },
      required: [],
    },
  },
];
