// ---------------------------------------------------------------------------
// Vizzor tool definitions for Claude tool-use
// ---------------------------------------------------------------------------

import type Anthropic from '@anthropic-ai/sdk';

/**
 * Tool definitions that Vizzor exposes to Claude during chat and analysis
 * sessions. Each tool maps to a concrete handler registered via
 * {@link setToolHandler} in the AI client.
 */
export const VIZZOR_TOOLS: Anthropic.Messages.Tool[] = [
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
      'Search for upcoming ICOs and token launches filtered by category and/or blockchain. Returns project name, dates, chain, category, and links.',
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
];
