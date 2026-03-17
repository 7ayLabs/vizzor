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
      'Generate a multi-signal composite prediction combining technical analysis (32%), blockchain fundamentals (23%), sentiment (15%), derivatives (15%), trend (10%), and macro (5%). Blockchain fundamentals act as contrapeso to reflexive price signals. Returns direction, confidence, composite score, and reasoning.',
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
  {
    name: 'get_chronovisor_prediction',
    description:
      'Get a ChronoVisor composite prediction combining 5 signal categories: on-chain (30%), ML ensemble (25%), prediction markets (20%), social/narrative (15%), and pattern matching (10%). Returns composite score, direction, confidence, signal breakdown, and accuracy metrics.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: {
          type: 'string',
          description: 'The token symbol (e.g. "BTC", "ETH", "SOL").',
        },
        horizons: {
          type: 'string',
          description:
            'Comma-separated prediction horizons: "1h", "4h", "1d", "7d". Defaults to "1h,4h,1d".',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'scan_trenches',
    description:
      'Scan for newly launched tokens from bonding curves and DEX listings. Returns tokens that recently migrated from launchpads with safety scores, creator reputation, and pump detection alerts. The trenches are the frontline of new token discovery.',
    input_schema: {
      type: 'object' as const,
      properties: {
        chain: {
          type: 'string',
          description: 'Blockchain to scan: "solana", "ethereum", "base". Defaults to "solana".',
        },
        minLiquidity: {
          type: 'number',
          description: 'Minimum liquidity in USD. Defaults to 1000.',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return. Defaults to 10.',
        },
      },
      required: [],
    },
  },
  {
    name: 'preview_trade',
    description:
      'Preview a potential trade with safety checks, slippage estimate, fee breakdown, and rug detection. Does NOT execute the trade — just shows what would happen. Use before executing any trade.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: {
          type: 'string',
          description: 'Token symbol or address.',
        },
        action: {
          type: 'string',
          description: '"buy" or "sell".',
        },
        amountUsd: {
          type: 'number',
          description: 'Amount in USD.',
        },
        chain: {
          type: 'string',
          description: 'Blockchain. Defaults to "ethereum".',
        },
      },
      required: ['symbol', 'action', 'amountUsd'],
    },
  },

  // -------------------------------------------------------------------------
  // Microstructure & Order Flow tools
  // -------------------------------------------------------------------------
  {
    name: 'get_market_structure',
    description:
      'Detect market structure: swing highs/lows, HH/HL/LH/LL sequence, bias (bullish/bearish/ranging), Break of Structure (BOS), Change of Character (CHoCH). Uses pivot detection on kline data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string', description: 'Token symbol (e.g. "BTC", "ETH").' },
        timeframe: {
          type: 'string',
          description: 'Kline timeframe: "5m", "15m", "1h" (default), "4h".',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_fvg_analysis',
    description:
      'Detect Fair Value Gaps (FVG) — imbalances where price moved too fast, leaving unfilled gaps. Returns bullish and bearish FVGs with fill status and strength score. Essential for identifying reversal and retracement zones.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string', description: 'Token symbol.' },
        timeframe: { type: 'string', description: 'Kline timeframe. Default: "1h".' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_vwap',
    description:
      'Calculate Volume-Weighted Average Price (VWAP) with ±1σ bands. Shows institutional fair value. Price above VWAP upper band = overextended, below lower band = undervalued. Deviation percentage indicates distance from fair value.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string', description: 'Token symbol.' },
        timeframe: { type: 'string', description: 'Kline timeframe. Default: "1h".' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_volume_delta',
    description:
      'Calculate cumulative volume delta (buy volume minus sell volume). Detects divergences: price rising + delta falling = bearish divergence (hidden selling), price falling + delta rising = bullish divergence (hidden buying). Key for manipulation and absorption detection.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string', description: 'Token symbol.' },
        timeframe: { type: 'string', description: 'Kline timeframe. Default: "1h".' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_liquidation_map',
    description:
      'Estimate liquidation zone clusters above and below current price at 10x/25x/50x/100x leverage. Shows where cascading liquidations will trigger based on open interest distribution. Essential for identifying market maker manipulation targets and stop-hunt zones.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string', description: 'Token symbol.' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_order_book_depth',
    description:
      'Fetch Binance Futures L2 order book depth. Returns bid/ask price levels with quantities, wall clusters (large resting orders), and imbalance ratio (>1 = buy pressure, <1 = sell pressure). Detects institutional absorption zones and potential spoofing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string', description: 'Token symbol.' },
        depth: { type: 'number', description: 'Order book levels: 5, 10, or 20 (default).' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_sr_zones',
    description:
      'Auto-detect support and resistance zones from price action. Clusters swing highs/lows, counts touches at each level, classifies as support/resistance/pivot. Higher touch count = stronger zone. Essential for identifying where price is likely to reverse.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string', description: 'Token symbol.' },
        timeframe: { type: 'string', description: 'Kline timeframe. Default: "1h".' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_squeeze_detector',
    description:
      'Detect short squeeze and long squeeze conditions. Analyzes funding rate extremes, long/short positioning, top trader ratios, market structure, volume delta divergence, liquidation clusters, and order book imbalance to identify potential cascading liquidation events. Returns entry/stop/targets if squeeze conditions are met.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string', description: 'Token symbol.' },
      },
      required: ['symbol'],
    },
  },

  // -------------------------------------------------------------------------
  // Blockchain Fundamentals tools — v0.12.5
  // -------------------------------------------------------------------------
  {
    name: 'get_blockchain_fundamentals',
    description:
      'Analyze blockchain fundamentals as a CONTRAPESO to reflexive price-based signals. Returns MVRV Z-Score (valuation vs realized price), NVT ratio (network value vs transaction volume), halving cycle phase, hashrate health, and supply dynamics. Use this to check if a rally has fundamental support or if a dip is fundamentally justified. BTC has full coverage; other chains have basic metrics.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: {
          type: 'string',
          description: 'Token symbol (e.g. "BTC", "ETH"). BTC has the most comprehensive data.',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_halving_cycle',
    description:
      'Get Bitcoin halving cycle analysis: current asymmetric phase (accumulation/early_markup/late_markup/distribution/markdown), cycle progress percentage, days to next halving, block reward, and cycle dampening factor. The dampening reflects that ETF flows now dominate over mining supply impact.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_network_health',
    description:
      'Get Bitcoin network health metrics: hashrate, Hash Ribbon signal (miner capitulation vs golden cross), difficulty adjustment, mempool congestion, NVT ratio, and MVRV Z-Score. Hash Ribbon golden cross in accumulation phase is historically the strongest BTC buy signal.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  // -------------------------------------------------------------------------
  // Prediction feedback loop tools — v0.12.5
  // -------------------------------------------------------------------------
  {
    name: 'resolve_predictions',
    description:
      'Resolve expired ChronoVisor predictions by comparing initial price vs current price. This is the FEEDBACK LOOP that makes predictions improve over time. Returns how many predictions were resolved, their accuracy, and triggers Bayesian weight adaptation. Call this periodically or after making predictions to close the learning loop.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_prediction_accuracy',
    description:
      'Get historical prediction accuracy metrics for ChronoVisor. Shows overall accuracy, per-horizon breakdown (1h/4h/1d/7d), total predictions resolved, and current learned weights. Use this to evaluate how well predictions are performing and which signal categories are most accurate.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: {
          type: 'string',
          description: 'Token symbol to filter accuracy (e.g. "BTC"). Omit for global accuracy.',
        },
        days: {
          type: 'number',
          description: 'Lookback window in days. Defaults to 30.',
        },
      },
      required: [],
    },
  },

  // -------------------------------------------------------------------------
  // Notification & Alert tools
  // -------------------------------------------------------------------------
  {
    name: 'set_price_alert',
    description:
      'Create a price alert that will notify the user when a token price crosses above or below a threshold. The alert persists until deleted.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: {
          type: 'string',
          description: 'Token symbol (e.g. "BTC", "ETH", "SOL").',
        },
        above: {
          type: 'number',
          description: 'Alert when price goes above this value.',
        },
        below: {
          type: 'number',
          description: 'Alert when price drops below this value.',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_alerts',
    description:
      'Get all configured alert rules AND recent notifications. Returns alert_rules (price thresholds, pump detection, etc. — auto-created when predictions run) and recent_notifications (triggered events). Use this when the user asks about their alerts, notifications, or monitoring rules.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of notifications to return. Defaults to 20.',
        },
        unreadOnly: {
          type: 'boolean',
          description: 'If true, only return unread notifications.',
        },
      },
      required: [],
    },
  },
  {
    name: 'configure_alerts',
    description:
      'Manage alert rules — list, enable, disable, or delete alert configurations. Use action "list" to see all rules, "enable"/"disable" to toggle, or "delete" to remove a rule.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          description: 'Action to perform: "list", "enable", "disable", or "delete".',
        },
        ruleId: {
          type: 'string',
          description: 'The alert rule ID to act on (required for enable/disable/delete).',
        },
        type: {
          type: 'string',
          description:
            'Filter rules by type when listing (e.g. "price_threshold", "pump_detected").',
        },
      },
      required: ['action'],
    },
  },
];
