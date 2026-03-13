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
      'Search for upcoming ICOs, token launches, and fundraising rounds filtered by category, blockchain, or round type. Powered by DeFiLlama raises and Pump.fun launches.',
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
        roundType: {
          type: 'string',
          description:
            'Filter by funding round type (e.g. "Seed", "Pre-Seed", "Series A", "Series B", "Token Launch").',
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
    name: 'get_funding_history',
    description:
      'Get complete funding history for a project by name. Returns all known fundraising rounds with amounts, investors, valuations, and dates. Also works for looking up an investor portfolio.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Project name or investor name to look up.',
        },
        type: {
          type: 'string',
          description:
            'Type of lookup: "project" for project funding history, "investor" for investor portfolio. Defaults to "project".',
        },
      },
      required: ['name'],
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
  {
    name: 'get_token_security',
    description:
      'Check token security via GoPlus API. Returns honeypot detection, tax analysis, mint/pause/blacklist capabilities, holder stats, and overall risk level. No API key required.',
    input_schema: {
      type: 'object' as const,
      properties: {
        address: {
          type: 'string',
          description: 'The token contract address.',
        },
        chain: {
          type: 'string',
          description: 'The blockchain (e.g. "ethereum", "bsc", "polygon", "arbitrum", "base").',
        },
      },
      required: ['address', 'chain'],
    },
  },
  {
    name: 'get_fear_greed',
    description:
      'Get the current Crypto Fear & Greed Index with 7-day history. Values: 0-20 Extreme Fear, 21-40 Fear, 41-60 Neutral, 61-80 Greed, 81-100 Extreme Greed.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_derivatives_data',
    description:
      'Get derivatives data from Binance Futures: funding rate, open interest, and mark price for a trading pair. Useful for sentiment analysis and market positioning.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: {
          type: 'string',
          description: 'The token symbol (e.g. "BTC", "ETH", "SOL").',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_technical_analysis',
    description:
      'Run technical analysis on a token: RSI, MACD, Bollinger Bands, EMA crossovers, ATR, OBV. Returns individual indicator signals and a composite direction with confidence.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: {
          type: 'string',
          description: 'The token symbol (e.g. "BTC", "ETH", "SOL").',
        },
        timeframe: {
          type: 'string',
          description: 'Kline interval: "1h", "4h", "1d". Defaults to "4h".',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_prediction',
    description:
      'Generate a multi-signal composite prediction combining technical analysis (40%), sentiment (20%), derivatives (20%), trend (15%), and macro (5%). Returns direction, confidence, composite score, and reasoning.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: {
          type: 'string',
          description: 'The token symbol (e.g. "BTC", "ETH", "SOL").',
        },
      },
      required: ['symbol'],
    },
  },
];
