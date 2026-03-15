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
      'Get LIVE current market data for a token including price, 24h volume, market cap, price change percentages, and circulating supply. Returns real-time data — never quote prices from training data.',
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
      'Search for CURRENT upcoming ICOs, token launches, and fundraising rounds filtered by category, blockchain, or round type. Returns LIVE data from DeFiLlama raises and Pump.fun launches, updated daily. MUST call for any ICO/launch question — training data is stale.',
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
      'Get REAL-TIME trending and hot tokens from DexScreener (boosted tokens) and CoinGecko trending combined. Returns what the market is excited about RIGHT NOW — trends change hourly. Always call for trending/hot token questions.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_crypto_news',
    description:
      'Get LIVE latest crypto news with sentiment analysis for a specific token or the market in general. Returns current headlines from CryptoPanic — MUST call for news questions, training data is outdated.',
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
      'Get LIVE recent crypto fundraising rounds, venture capital investments, and token launches. Returns CURRENT data updated daily from DeFiLlama — always call this for ICO/funding questions, never use training data.',
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
      'Get the LIVE Crypto Fear & Greed Index with 7-day history (updated daily). Values: 0-20 Extreme Fear, 21-40 Fear, 41-60 Neutral, 61-80 Greed, 81-100 Extreme Greed. Call for any market sentiment question.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_derivatives_data',
    description:
      'Get LIVE derivatives data from Binance Futures: funding rate (updates every 8h), open interest, and mark price for a trading pair. Essential for current market positioning analysis.',
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
  {
    name: 'get_ml_prediction',
    description:
      'Get an ML-enhanced prediction using LSTM/Random Forest models from the ML sidecar. Returns direction, probability, model confidence, and feature importance. Falls back to rule-based prediction if ML sidecar is unavailable.',
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
    name: 'get_model_accuracy',
    description:
      'Get historical accuracy metrics for ML prediction models. Shows total predictions, accuracy percentage, and breakdown by direction (up/down/sideways).',
    input_schema: {
      type: 'object' as const,
      properties: {
        model: {
          type: 'string',
          description:
            'Model name (e.g. "lstm-predictor", "signal-classifier"). Defaults to "lstm-predictor".',
        },
        days: {
          type: 'number',
          description: 'Number of days to look back for accuracy stats. Defaults to 30.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_rug_ml_analysis',
    description:
      'Run ML-powered rug pull analysis on a token. Uses Gradient Boosted classifier trained on historical rug patterns to predict rug probability, risk level, and key risk factors. Enhanced version of check_rug_indicators with ML scoring.',
    input_schema: {
      type: 'object' as const,
      properties: {
        address: {
          type: 'string',
          description: 'The token contract address to analyze.',
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
    name: 'get_wallet_behavior',
    description:
      'ML-powered wallet behavior classification. Uses LSTM model to classify a wallet as: normal_trader, bot, whale, sniper, mev_bot, mixer_user, or rug_deployer. Returns behavior type, confidence, risk score, and behavioral indicators.',
    input_schema: {
      type: 'object' as const,
      properties: {
        address: {
          type: 'string',
          description: 'The wallet address to classify.',
        },
        chain: {
          type: 'string',
          description: 'The blockchain the wallet is on.',
        },
      },
      required: ['address', 'chain'],
    },
  },
  {
    name: 'analyze_news_sentiment',
    description:
      'ML-powered NLP sentiment analysis on crypto news. Uses DistilBERT model to analyze news headlines for a token, returning bullish/bearish/neutral sentiment, confidence score, and detected topics (regulation, defi, security, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: {
          type: 'string',
          description: 'Token symbol to analyze news sentiment for (e.g. "BTC", "ETH").',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_market_regime',
    description:
      'Detect the current market regime using ML Hidden Markov Model. Returns regime type (trending_bull, trending_bear, ranging, volatile, capitulation), confidence, and probability distribution across all regimes. Uses HMM when available, falls back to heuristic analysis.',
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
    name: 'get_ta_ml_analysis',
    description:
      'Run ML-enhanced technical analysis with learned signal weights. Uses Random Forest to interpret RSI, MACD, Bollinger Bands, EMA crossover, ATR, OBV simultaneously. Returns signals with ML-derived importance weights and composite direction. More accurate than static weight TA.',
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
    name: 'get_project_risk_ml',
    description:
      'Run ML-powered project risk scoring on a token. Uses GBM classifier trained on contract features (verification, holder concentration, taxes, mint/pause/blacklist capabilities) to predict overall project risk probability and identify top risk factors.',
    input_schema: {
      type: 'object' as const,
      properties: {
        address: {
          type: 'string',
          description: 'The token contract address to analyze.',
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
    name: 'get_portfolio_forecast',
    description:
      'Generate forward-looking portfolio performance predictions using ML. Analyzes trade history to predict next-period return, Sharpe ratio, and max drawdown. Requires at least 10 completed trades.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agentName: {
          type: 'string',
          description: 'The trading agent name to forecast for.',
        },
      },
      required: ['agentName'],
    },
  },
  {
    name: 'get_ml_model_health',
    description:
      'Get health status of all ML models in the sidecar including loaded status, version, last training date, accuracy, uptime, and total predictions served.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'classify_user_intent',
    description:
      'Classify a user message into an intent category (e.g. price_check, token_analysis, prediction, news, portfolio, agent_management) using ML NLP. Returns intent, confidence, detected tokens, and detected addresses.',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: 'The user message text to classify.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'run_backtest',
    description:
      'Run a historical backtest for a trading strategy. Simulates strategy execution on historical kline data and returns trades, metrics (return, win rate, Sharpe, drawdown), and equity curve.',
    input_schema: {
      type: 'object' as const,
      properties: {
        strategy: {
          type: 'string',
          description: 'Strategy name: "momentum", "trend-following", or "ml-adaptive".',
        },
        pair: {
          type: 'string',
          description: 'Trading pair (e.g. "BTCUSDT").',
        },
        from: {
          type: 'string',
          description: 'Start date (YYYY-MM-DD).',
        },
        to: {
          type: 'string',
          description: 'End date (YYYY-MM-DD).',
        },
        timeframe: {
          type: 'string',
          description: 'Candle timeframe: "1h", "4h", "1d". Defaults to "4h".',
        },
      },
      required: ['strategy', 'pair', 'from', 'to'],
    },
  },
  {
    name: 'create_agent',
    description:
      'Create an autonomous trading agent that monitors crypto pairs using a strategy (momentum or trend-following). Returns the created agent config.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'A unique name for the agent (e.g. "btc-momentum-bot").',
        },
        strategy: {
          type: 'string',
          description:
            'Trading strategy: "momentum" (RSI+MACD) or "trend-following" (EMA crossover).',
        },
        pairs: {
          type: 'string',
          description: 'Comma-separated trading pairs (e.g. "BTC,ETH,SOL").',
        },
        interval: {
          type: 'number',
          description: 'Cycle interval in seconds. Defaults to 60.',
        },
      },
      required: ['name', 'strategy', 'pairs'],
    },
  },
  {
    name: 'list_agents',
    description:
      'List all created trading agents with their status, strategy, and monitored pairs.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_agent_status',
    description:
      'Get detailed status of a trading agent including cycle count, last decision, and recent trade signals.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'The agent name.',
        },
      },
      required: ['name'],
    },
  },
];
