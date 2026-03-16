<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="vizzor_logoicon.png">
    <source media="(prefers-color-scheme: light)" srcset="vizzor_logodarkicon.png">
    <img alt="Vizzor" src="vizzor_logodarkicon.png" width="120">
  </picture>
</p>

<h1 align="center">Vizzor</h1>

<p align="center">
  <strong>See the future of crypto before it happens.</strong><br>
  <em>AI-powered price predictions for coins, tokens, and currencies across every chain and DEX.</em>
</p>

<p align="center">
  <a href="https://github.com/7ayLabs/vizzor/actions/workflows/ci.yml"><img src="https://github.com/7ayLabs/vizzor/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@vizzor/cli"><img src="https://img.shields.io/npm/v/@vizzor/cli" alt="npm"></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/License-BUSL--1.1-blue.svg" alt="License"></a>
</p>

<p align="center">
  <a href="#what-vizzor-predicts">Predictions</a> &bull;
  <a href="#installation">Install</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#prediction-engine">Engine</a> &bull;
  <a href="#command-reference">Commands</a> &bull;
  <a href="#ai-tools">AI Tools</a> &bull;
  <a href="#data-sources">Data Sources</a> &bull;
  <a href="#agents">Agents</a> &bull;
  <a href="#configuration">Config</a>
</p>

---

Vizzor is a crypto market prediction engine. It pulls live data from 7 APIs, runs technical analysis on raw candles, reads derivatives positioning and market sentiment, then synthesizes price predictions with actual dollar targets across multiple timeframes -- from 5 minutes to 3 months.

Ask about any coin, token, or currency. Vizzor fetches real-time data, computes signals, and gives you a prediction with numbers, not opinions.

```
vizzor
> predict ETH at 16:00 today

ETH at $2,112 | Bullish | Confidence: Medium-High
  At 4:00 PM:  $2,128 (+0.8%) bull / $2,104 (-0.4%) bear
  1 day:       $2,156 (+2.1%) bull / $2,068 (-2.1%) bear
  7 days:      $2,295 (+8.7%) bull / $1,985 (-6.0%) bear
  1 month:     $2,560 (+21%) bull  / $1,840 (-13%) bear
  Support: $2,005 / $1,900  |  Resistance: $2,220 / $2,340
```

---

## What Vizzor Predicts

**Any tradable crypto asset.** BTC, ETH, SOL, meme coins, new DEX launches, tokens by contract address -- if it has a price, Vizzor can analyze it.

### Price Predictions

Every prediction includes dollar-value targets across all timeframes:

| Timeframe | Use Case |
|-----------|----------|
| **5 min / 15 min** | Scalping, quick entries |
| **1 hour / 4 hours** | Intraday trading |
| **1 day / 7 days** | Swing trades |
| **2 weeks / 1 month** | Position trades |
| **3 months** | Macro outlook |
| **Custom time** | "predict BTC at 16:00 today" |

Each timeframe shows bullish, most likely, and bearish scenarios with percentage moves. Predictions include support/resistance levels, signal confidence, and what would invalidate the forecast.

### Market Intelligence

Beyond price targets, Vizzor provides:

- **Token security audits** -- honeypot detection, tax analysis, mint/blacklist flags, rug pull indicators
- **On-chain forensics** -- wallet analysis, whale tracking, holder concentration, token flow patterns
- **Derivatives positioning** -- funding rates, open interest, long/short ratios from Binance Futures
- **Sentiment analysis** -- Fear & Greed Index, news sentiment, buy/sell transaction ratios
- **Trending discovery** -- what tokens are moving right now across DexScreener and CoinGecko
- **ICO tracking** -- upcoming launches, fundraising rounds, investor data from DeFiLlama

---

## Requirements

| Dependency | Version | Notes |
|------------|---------|-------|
| **Node.js** | >= 20.0.0 | ES2022 target, ESM modules |
| **pnpm** | >= 8.0 | Recommended (npm/yarn also work) |
| **Python** | 3.x | Required by `better-sqlite3` native build |
| **C++ compiler** | GCC / Clang / MSVC | Required by `better-sqlite3` native build |
| **Docker** | >= 24 | Optional, for ML sidecar + PostgreSQL |

Works on **macOS**, **Linux**, and **Windows**. No GPU required.

---

## Installation

```bash
npm install -g @vizzor/cli
```

```bash
# Or run directly
npx @vizzor/cli
```

### From Source

```bash
git clone https://github.com/7ayLabs/vizzor.git
cd vizzor
pnpm install
pnpm build
pnpm link --global
```

### Docker (Full Stack)

```bash
cp .env.example .env    # Configure API keys
docker compose up -d     # Starts CLI + ML sidecar + PostgreSQL
```

---

## Quick Start

```bash
# 1. Set your API key
vizzor config set anthropicApiKey <your-key>
# or: export ANTHROPIC_API_KEY=<your-key>

# 2. Launch
vizzor
```

Then just ask:

```
> predict BTC price next week
> analyze $PEPE security and price outlook
> what's trending in crypto right now
> track wallet 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
> audit contract 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984
```

---

## Prediction Engine

### Multi-Signal Composite

Vizzor builds predictions from 5 weighted signal dimensions via the **ChronoVisor engine** (v0.12):

```
On-Chain Intelligence ........ 30%    Whale tracking, exchange flow, LP delta
ML Ensemble .................. 25%    14 trained models (LSTM, GBM, RF, HMM, etc.)
Prediction Markets ........... 20%    CLOB odds + momentum from prediction platforms
Social / Narrative ........... 15%    News feeds, NLP sentiment, narrative detection
Pattern Reverse Engineering .. 10%    Cosine similarity against historical patterns
                              ----
Composite Score        -100 to +100
```

Weights are **learned via Bayesian updating** — the engine tracks accuracy per signal category and adjusts weights over time.

Signals are computed from raw data before the AI sees them. The AI presents and contextualizes the pre-computed analysis -- it doesn't invent numbers.

### Technical Analysis

Computed from Binance kline data. No third-party TA APIs -- pure math on raw candles.

| Indicator | Signal |
|-----------|--------|
| **RSI** (14) | Overbought > 70, Oversold < 30 |
| **MACD** (12, 26, 9) | Crossover direction + histogram momentum |
| **Bollinger Bands** (20, 2) | %B position for squeeze/breakout |
| **EMA Crossover** (12/26) | Golden cross / death cross |
| **ATR** (14) | Volatility regime |
| **OBV** | Volume-price confirmation |

### Volatility-Scaled Projections

Price targets use `hourlyVol * sqrt(hours)` scaling -- wider ranges for longer timeframes, amplified for micro-cap/meme tokens. The engine automatically detects meme coins (Pump.fun, sub-$1M market cap) and applies higher volatility multipliers.

### Time-Aware Predictions

Ask for any specific time and Vizzor computes a targeted projection:

```
> predict SOL at 3:00pm          # specific clock time
> predict ETH in 30 minutes      # relative time
> predict BTC tomorrow            # next day
> predict DOGE end of week        # end of week
```

### Institutional Microstructure Analysis (v0.12)

8 dedicated tools for institutional-grade order flow and market structure analysis. When asked for a full analysis, the AI chains all 8 tools and synthesizes a multi-scenario report.

| Tool | Signal |
|------|--------|
| **Market Structure** | Swing highs/lows, HH/HL/LH/LL sequence, BOS/CHoCH, market bias |
| **Fair Value Gaps** | Bullish/bearish FVGs with fill status, strength, and proximity |
| **VWAP** | Volume-weighted average price + standard deviation bands |
| **Volume Delta** | Cumulative buy/sell delta, divergence detection |
| **Liquidation Map** | Estimated liquidation clusters at 10x/25x/50x/100x leverage |
| **Order Book Depth** | L2 bid/ask walls, imbalance ratio, institutional absorption zones |
| **Support/Resistance** | Auto-detected S/R zones from price action with touch counts |
| **Squeeze Detector** | Short/long squeeze probability from multi-signal analysis |

Full microstructure analysis outputs a structured 7-section report:

```
CONTEXTO GENERAL         → Price, bias, structure, psychological levels
ESCENARIO 1 – BULL TRAP  → Upside manipulation zone, short entry, targets
ESCENARIO 2 – BEAR TRAP  → Downside manipulation zone, long entry, targets
ESCENARIO 3 – SHORT SQZ  → Short squeeze cascade setup
ESCENARIO 4 – LONG SQZ   → Long squeeze cascade setup
ZONAS DE MANIPULACIÓN    → Key institutional targeting zones
CONCLUSIÓN OPERATIVA     → Highest probability scenario
```

Works with all AI providers. For Ollama: data is pre-computed and injected into context. For Claude/OpenAI/Gemini: AI calls tools individually and synthesizes the report.

```
> full microstructure analysis for BTC
> show me FVGs on ETH 15m
> where are the liquidation clusters for SOL?
> is there a short squeeze setup on BTC?
```

---

## Command Reference

### CLI Commands

```
vizzor                              # Launch interactive TUI
vizzor scan <token> [options]       # Token risk analysis
vizzor trends [options]             # Market trends + top movers
vizzor track <wallet> [options]     # Wallet forensics
vizzor audit <contract> [options]   # Contract security audit
vizzor ico list [options]           # ICO/IDO tracker
vizzor config init                  # Initialize config
vizzor config set <key> <value>     # Set config value
vizzor config show                  # Show config
vizzor wallet create|import|list|delete  # Wallet management
vizzor backtest [options]           # Historical strategy backtest
vizzor bot start [options]          # Start Discord/Telegram bots
vizzor bot validate                 # Check bot token configuration
```

### TUI Slash Commands

| Command | Description |
|---------|-------------|
| `/scan <address> [--chain <chain>]` | Token security + risk scan |
| `/track <wallet> [--chain <chain>]` | Wallet forensics |
| `/trends` | Trending tokens + top gainers/losers |
| `/audit <contract> [--chain <chain>]` | Smart contract audit |
| `/add <symbol>` | Add a token to the live price ticker |
| `/remove <symbol>` | Remove a token from the price ticker |
| `/chain [<id>]` | Show available chains or switch chain |
| `/config` | Show config with setup guidance |
| `/config set <key> <value>` | Update a config value |
| `/provider` | Show current AI provider |
| `/provider list` | List all providers with availability |
| `/provider <name>` | Switch to `anthropic`, `openai`, `gemini`, `ollama` |
| `/agent create <name> [options]` | Create autonomous prediction agent |
| `/agent list` | List all agents |
| `/agent start <name>` | Start agent cycle |
| `/agent stop <name>` | Stop agent |
| `/agent status <name>` | View status + recent decisions |
| `/agent delete <name>` | Delete an agent |
| `/agent strategies` | List available strategies |
| `/backtest` | Run historical strategy backtest |
| `/help` | Command reference |
| `/clear` | Clear messages |
| `/exit` | Quit |

**Price Ticker:** Arrow keys to navigate, **Enter** to trigger full AI prediction for any token, **Tab** to toggle focus.

### Discord Bot

| Command | Description |
|---------|-------------|
| `/scan <address>` | Token security + risk scan |
| `/trends` | Trending tokens + market data |
| `/track <wallet>` | Wallet forensics |
| `/ico` | Upcoming launches and rounds |
| `/audit <contract>` | Contract audit |
| `/price <symbol>` | Live price check |
| `/predict <symbol>` | AI prediction with signals |
| `/wallet <address>` | ETH wallet balance |
| `/agent_create` | Create a trading agent |
| `/agent_list` | List all agents |
| `/agent_start` | Start an agent |
| `/agent_stop` | Stop an agent |
| `/agent_status` | Agent status & decisions |
| `/agent_delete` | Delete an agent |
| `/help` | Show all commands |
| *@mention* | AI-powered chat with live data |

**Setup**: Enable the `MESSAGE_CONTENT` privileged intent in the [Discord Developer Portal](https://discord.com/developers/applications) for @mention AI chat.

### Telegram Bot

| Command | Description |
|---------|-------------|
| `/scan <address>` | Token security scan |
| `/trends` | Trending tokens + gainers/losers |
| `/track <wallet>` | Wallet forensics |
| `/ico` | Upcoming launches and rounds |
| `/audit <contract>` | Contract audit |
| `/price <symbol>` | Live price check |
| `/predict <symbol>` | AI prediction with signals |
| `/wallet <address>` | ETH wallet balance |
| `/agent_create` | Create a trading agent |
| `/agent_list` | List all agents |
| `/agent_start` | Start an agent |
| `/agent_stop` | Stop an agent |
| `/agent_status` | Agent status & decisions |
| `/agent_delete` | Delete an agent |
| *Any text* | AI-powered chat with live data |

---

## AI Tools

Vizzor exposes **30+ tools** to the AI. During conversation, the AI autonomously calls whichever tools it needs to build a complete prediction.

| Tool | What It Provides |
|------|------------------|
| `get_market_data` | Price, volume, market cap (CoinGecko) |
| `search_token_dex` | Real-time DEX pair data (DexScreener) |
| `get_technical_analysis` | RSI, MACD, Bollinger, EMA, ATR, OBV |
| `get_prediction` | Multi-signal composite prediction |
| `get_derivatives_data` | Funding rate, open interest (Binance Futures) |
| `get_fear_greed` | Fear & Greed Index + 7-day history |
| `get_crypto_news` | News headlines with sentiment scoring |
| `get_trending` | Hot tokens across DexScreener + CoinGecko |
| `get_token_info` | On-chain token data (name, supply, holders) |
| `get_token_security` | GoPlus security scan (honeypot, taxes, flags) |
| `analyze_wallet` | Wallet forensics (patterns, holdings, risk) |
| `check_rug_indicators` | Rug pull detection suite |
| `search_upcoming_icos` | ICO/IDO tracker with filters |
| `get_raises` | Recent fundraising rounds |
| `get_funding_history` | Project/investor funding history |
| `create_agent` | Deploy autonomous prediction agent |
| `list_agents` | List active agents |
| `get_agent_status` | Agent status and decisions |
| `run_backtest` | Historical strategy backtesting |
| `get_ml_prediction` | ML model price prediction |
| `get_ml_regime` | Market regime classification |
| `get_ml_model_health` | ML sidecar health and model status |
| `classify_user_intent` | AI-powered query intent detection |
| `get_chronovisor_prediction` | ChronoVisor ensemble prediction (v0.12) |
| `scan_trenches` | Real-time memecoin migration scanner (v0.12) |
| `preview_trade` | Trade preview with safety checks (v0.12) |
| `get_market_structure` | Swing points, HH/HL/LH/LL, BOS/CHoCH, market bias (v0.12) |
| `get_fvg_analysis` | Fair Value Gap detection with fill status and strength (v0.12) |
| `get_vwap` | Volume-Weighted Average Price + deviation bands (v0.12) |
| `get_volume_delta` | Cumulative buy/sell delta + divergence detection (v0.12) |
| `get_liquidation_map` | Liquidation zone clusters at 10x/25x/50x/100x (v0.12) |
| `get_order_book_depth` | L2 order book depth, bid/ask walls, imbalance (v0.12) |
| `get_sr_zones` | Auto-detected support/resistance zones (v0.12) |
| `get_squeeze_detector` | Short/long squeeze probability analysis (v0.12) |

### AI Providers

| Provider | Model | Tool Support | Notes |
|----------|-------|--------------|-------|
| **Anthropic** | Claude Opus / Sonnet | Full tool-use | Default. Best prediction quality |
| **OpenAI** | GPT-4 Turbo | Full tool-use | Function calling |
| **Google** | Gemini Pro | Full tool-use | Tool-use support |
| **Ollama** | Any local model | Context injection | Pre-computed signals injected into context |

For providers without tool support (Ollama), Vizzor pre-fetches all relevant data, runs signal computation, and injects pre-written analysis directly into the context. The model presents the pre-computed predictions rather than generating them from scratch.

```bash
/provider openai
/provider ollama llama3
```

---

## Data Sources

| Source | Data | Auth |
|--------|------|------|
| **Binance** | Klines, tickers, funding rates, open interest, order book depth, long/short ratios, taker buy/sell, gainers/losers | Public |
| **DexScreener** | DEX pairs, trending tokens, real-time pricing | Public |
| **GoPlus** | Token security, honeypot detection, holder analysis | Public |
| **DeFiLlama** | TVL, fundraising rounds, protocol metrics | Public |
| **CryptoPanic** | News aggregation with sentiment | Free tier |
| **Fear & Greed** | Crypto Fear & Greed Index | Public |
| **Pump.fun** | Solana meme coin launches | Public |

All responses cached with configurable TTL (5 min for market data, 1 hour for token info, 24 hours for contract code).

### Database Layer

Dual-backend storage with automatic migration:

| Backend | Use Case |
|---------|----------|
| **SQLite** | Default, zero-config local cache |
| **PostgreSQL** | Multi-instance deployments, Docker stack |

Data pipeline collectors run on configurable intervals, aggregating market snapshots, token metrics, and wallet activity into time-series tables for ML training and trend analysis.

### ML Prediction Sidecar

A Python FastAPI sidecar enhances predictions with trained models:

| Model | Algorithm | Purpose |
|-------|-----------|---------|
| **Price Predictor** | LSTM | Short-term price direction |
| **Signal Classifier** | Random Forest | Buy/sell/hold signal quality |
| **Anomaly Detector** | Isolation Forest | Unusual market activity |
| **Rug Detector** | GBM | Scam token identification |
| **Wallet Classifier** | LSTM | Wallet behavior profiling |
| **Sentiment NLP** | DistilBERT | News headline sentiment |
| **Pump Detector** | CUSUM + GBM | Pump/dump anomaly detection (v0.12) |
| **Narrative Detector** | TF-IDF + RF | Crypto narrative identification (v0.12) |
| **Divergence Detector** | Statistical | Prediction market vs price divergence (v0.12) |

Models fall back to heuristic scoring when the sidecar is unavailable. Start with Docker:

```bash
docker compose up ml-sidecar
curl http://localhost:8000/health
```

### REST API

Authenticated REST API exposing all Vizzor capabilities programmatically:

```bash
# Start the API server
vizzor api start --port 3100

# Create an API key
vizzor api key create "my-app"

# Endpoints
GET  /health                    # Health check (public)
GET  /docs                      # OpenAPI/Swagger UI (dev only)
POST /scan                      # Token security scan
POST /trends                    # Market trends
POST /track                     # Wallet forensics
POST /predict                   # AI prediction
POST /audit                     # Contract audit
GET  /v1/market/price/:symbol   # Single symbol price
GET  /v1/market/prices?symbols= # Batch prices (comma-separated)
GET  /v1/market/trending        # Trending tokens
GET  /v1/market/fear-greed      # Fear & Greed Index
GET  /v1/market/ml-health       # ML sidecar status
POST /v1/chat                   # AI chat (SSE streaming)
POST /v1/backtest               # Historical backtest
GET  /v1/agents                 # List agents
POST /v1/agents                 # Create agent
POST /v1/agents/:name/start    # Start agent
POST /v1/agents/:name/stop     # Stop agent
GET  /v1/portfolio/:id          # Agent portfolio
GET  /v1/market/trenches        # Trenches scanner results (v0.12)
GET  /v1/chronovisor/:symbol    # ChronoVisor prediction (v0.12)
POST /v1/chat/thread            # Threaded chat reply (v0.12)
POST /v1/agents/emergency-stop  # Global kill switch (v0.12)
WS   /ws                        # WebSocket real-time push (v0.12)
```

All endpoints require `X-API-Key` header. Rate limited to 300 req/min per key. Keys are hashed with scrypt and stored locally.

### Autonomous Agents v2 (v0.12)

Portfolio-aware trading agents with HD wallets and paper/live execution:

- **HD Wallet System** — BIP-44 derivation via `@scure/bip32`, per-agent wallet isolation, memory zeroing
- **Paper Trading Engine** — realistic simulation with slippage model (top-50/mid-cap/small-cap tiers), DEX fees, gas estimation
- **Live Execution** — 7-step safety pipeline (validate → prepare → simulate → approve → execute → record → cleanup)
- **Portfolio Manager** — tracks positions, calculates P&L, manages allocation limits
- **Risk System** — Kelly criterion position sizing, ATR-based stop losses, drawdown limits, global kill switch
- **Spending Limits** — per-agent daily/weekly caps with rolling window enforcement
- **ML-Adaptive Strategy** — combines RSI, MACD, EMA, Bollinger, funding rate with ML regime detection and ChronoVisor signals
- **Strategy Registry** — pluggable strategy system, easy to add custom strategies

### Trenches Scanner (v0.12)

Real-time memecoin detection with sub-minute alpha window:

- **Launchpad WebSocket** — Solana blockSubscribe for token migration events
- **DEX Pair Tracker** — new pair detection and liquidity tracking across chains
- **Migration Tracker** — bonding curve progress monitor with velocity calculation
- **Smart Money Tracker** — wallet clustering and creator reputation scoring
- **Pump Detector** — CUSUM anomaly detection on 1-minute micro-timeframes
- **Pre-Trade Safety Gate** — mandatory 4-check pipeline (on-chain security, ML rug detection, honeypot simulation, creator reputation)

### Security

- **AES-256-GCM encryption** for sensitive data at rest (scrypt N=2^18 OWASP)
- **HMAC signatures** for API request integrity
- **Persistent audit logging** — SQLite-backed event log with 100-event memory buffer (v0.12)
- **Prompt injection defense** — Unicode escape, Base64, HTML entity bypass detection (v0.12)
- **Per-key API rate limiting** — per-API-key rate limits from database (v0.12)
- **Security headers** — CSP, X-Frame-Options, HSTS, X-Content-Type-Options (v0.12)
- **Global circuit breaker** — emergency stop across all agents with audit trail (v0.12)
- **Input sanitization** across all user-facing surfaces
- **Supply chain security** — pinned crypto dependencies, `pnpm audit` in CI (v0.12)

### n8n Workflow Automation

14 pre-built n8n workflows for automated operations:

| Workflow | Function |
|----------|----------|
| Data Collection | Scheduled market data ingestion |
| Alert Pipeline | Real-time anomaly alerts |
| ML Retraining | Periodic model retraining |
| Agent Monitor | Agent health and decision tracking |
| Daily Report | Automated portfolio summaries |
| Anomaly Analysis | Deep-dive unusual activity |
| Narrative Generator | Market narrative detection |
| Portfolio Rebalancer | Automated rebalancing signals |
| Strategy Tournament | Strategy backtesting comparison |
| Arbitrage Scanner | Cross-DEX price divergence |

```bash
docker compose up -d  # Starts Vizzor + ML sidecar + PostgreSQL + n8n + Web Dashboard
```

### Extended ML Models

v0.10 adds 7 new Python models to the sidecar:

| Model | Algorithm | Purpose |
|-------|-----------|---------|
| **Trend Scorer** | XGBoost | Market trend strength scoring |
| **TA Interpreter** | Random Forest | Technical analysis signal weighting |
| **Strategy Bandit** | Contextual Bandit | Adaptive strategy selection |
| **Regime Detector** | HMM | Market regime classification |
| **Project Risk** | GBM | Comprehensive project risk scoring |
| **Portfolio Optimizer** | Mean-Variance | Dynamic position sizing |
| **Intent Classifier** | DistilBERT | User query intent detection |

All 16 models integrated across 17 TypeScript modules with graceful fallback to heuristics. v0.11 adds model training pipeline (`POST /train`, `POST /evaluate`) and wires remaining ML modules. v0.12 adds pump detection, narrative detection, and prediction market divergence detection.

---

## Agents

Autonomous prediction agents that run a continuous **think -> analyze -> decide -> act** cycle.

```bash
/agent create alpha --strategy momentum --pairs BTC,ETH,SOL --interval 60
/agent start alpha
/agent status alpha
```

### Strategies

| Strategy | Signals | Entry | Exit |
|----------|---------|-------|------|
| **Momentum** | RSI + MACD + Bollinger + Funding | RSI crosses above 30 + bullish MACD | RSI > 70 + bearish divergence |
| **Trend-Following** | EMA Crossover + OBV + Fear & Greed | Golden cross + rising volume | Death cross |
| **ML-Adaptive** | All TA + Funding + Fear & Greed + Regime | ML composite score > threshold | ML signal reversal + stop loss |

> Agents can run in **alert-only mode** or with **live trade execution** via DEX integration.

### Trade Execution (v0.11, enhanced v0.12)

On-chain trade execution with 7-step safety pipeline:

- **HD Wallet System** — BIP-44 per-agent wallet derivation with memory zeroing (v0.12)
- **Wallet Manager** — encrypted private key storage (AES-256-GCM + scrypt N=2^18) at `~/.vizzor/wallets/`
- **DEX Router** — Uniswap V3 SwapRouter02 + Quoter V2 for real `amountOutMinimum` (v0.12)
- **Paper Trading** — realistic simulation with market-cap-tier slippage model (v0.12)
- **Slippage Protection** — on-chain quote-based slippage (replaces static default)
- **Tx Simulator** — `eth_call` simulation before execution (v0.12)
- **Spending Limits** — per-agent rolling 24h/7d caps (v0.12)
- **Approval Manager** — ERC-20 approval tracking with exact amounts (v0.12)
- **Balance Monitor** — periodic low-balance alerts (v0.12)

```bash
vizzor wallet create           # Create encrypted wallet
vizzor wallet import           # Import existing private key
vizzor wallet list             # List managed wallets
```

### Backtesting Engine (v0.11)

Historical strategy simulation with walk-forward analysis:

```bash
vizzor backtest --strategy momentum --pair BTCUSDT --from 2024-01-01 --to 2024-12-31
```

- Run any strategy against historical kline data
- Metrics: total return, win rate, profit factor, Sharpe ratio, max drawdown
- Equity curve and drawdown visualization
- Walk-forward analysis with rolling train/test windows
- Available via CLI, TUI (`/backtest`), AI tool, and REST API (`POST /v1/backtest`)

### Real-time WebSocket Feeds (v0.11)

Live market data via Binance WebSocket streams:

- Trade, kline, and ticker streams with auto-reconnect
- Connection pooling (up to 5 connections, 1024 streams each)
- In-memory price cache for instant access
- Agent engine prefers WebSocket data over REST polling

### Web Dashboard (v0.11, redesigned v0.12)

Next.js 15 web dashboard at `http://localhost:3001`:

- **AI Chat** — full conversational interface with streaming responses, tool result cards, threaded replies, and inline trade action cards (BUY/SELL with confirmation modal)
- **Dashboard** — market overview with Fear & Greed, ChronoVisor signal breakdown, sentiment intelligence, regime detection, trending tokens, news feed, agent summary, and per-model ML accuracy metrics
- **Markets** — market analysis with symbol selector, wallet analyzer, and on-chain intelligence
- **Agents** — create, start/stop, and monitor autonomous trading agents with paper/live mode
- **Portfolio** — positions, trade history, performance metrics with total return tracking
- **Settings** — API and provider configuration
- **Docs** — interactive documentation for all AI tools and chat commands

**UI features (v0.12 glass redesign):**
- Gray/white glass morphism design system — no colored accents (green/red only for profit/loss)
- `backdrop-blur-xl` glass card pattern across all components
- Inter font family (variable weight)
- Skeleton loaders with shimmer animation
- WebSocket real-time push (price, agent decisions, trenches alerts, ML predictions)
- Live crypto ticker (top 100 coins) with batch price fetching
- Cryptocurrency icons (CDN + letter fallback for newer tokens)
- Custom Vizzor branding
- API and ML health indicators
- Responsive mobile layout with collapsible sidebar
- **Rich chat rendering** — colored section headers, $SYMBOL crypto tags with icons, tables, LaTeX cleanup
- **Compact tool calls** — single collapsible group with progress bar during streaming
- **Collapsible responses** — auto-collapse long messages with "Show more/less" toggle
- **Full-page scroll** — natural page scroll with sticky input bar
- **Conversation memory** — context-aware multi-turn chat with thread support

```bash
docker compose up web           # Start dashboard on port 3001
```

### Training Pipeline (v0.11)

Model training and evaluation via the ML sidecar:

- `POST /train` — train rug detector, trend scorer, regime classifier, sentiment models
- `POST /evaluate` — evaluate model accuracy on held-out test sets
- Data loaders for PostgreSQL-backed labeled datasets

---

## Supported Chains

| Chain | Status | Security Scan |
|-------|--------|---------------|
| Ethereum | Live | GoPlus |
| Polygon | Live | GoPlus |
| Arbitrum | Live | GoPlus |
| Optimism | Live | GoPlus |
| Base | Live | GoPlus |
| BSC | Live | GoPlus |
| Avalanche | Live | GoPlus |
| Solana | Live | GoPlus |
| Sui | Live | GoPlus |
| Aptos | Live | GoPlus |
| TON | Live | GoPlus |

New chains are added by implementing the `ChainAdapter` interface.

---

## Configuration

Config at `~/.vizzor/config.yaml`. Environment variables override file values.

### Required

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude AI -- primary prediction engine |
| `ETHERSCAN_API_KEY` | Transaction history, contract source |

### Optional

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | GPT-4 as alternative provider |
| `GOOGLE_API_KEY` | Gemini as alternative provider |
| `ALCHEMY_API_KEY` | Premium RPC endpoints |
| `COINGECKO_API_KEY` | Extended market data |
| `CRYPTOPANIC_API_KEY` | News with sentiment |
| `DISCORD_TOKEN` | Discord bot |
| `TELEGRAM_BOT_TOKEN` | Telegram bot |

### Full Config

```yaml
anthropicApiKey: <your-key>
etherscanApiKey: <your-key>
defaultChain: ethereum

rpc:
  ethereum: https://eth-mainnet.g.alchemy.com/v2/<your-key>
  polygon: https://polygon-mainnet.g.alchemy.com/v2/<your-key>

ai:
  provider: anthropic        # anthropic | openai | gemini | ollama
  model: claude-sonnet-4-20250514
  maxTokens: 4096
  ollamaHost: http://localhost:11434

output:
  format: table
  color: true
  verbose: false

cacheTtl:
  tokenInfo: 3600
  marketData: 300
  walletData: 600
  contractCode: 86400
```

---

## Development

```bash
git clone https://github.com/7ayLabs/vizzor.git
cd vizzor
pnpm install

pnpm dev              # Dev mode (tsx)
pnpm build            # Build (tsup)
pnpm lint             # ESLint
pnpm typecheck        # TypeScript strict
pnpm test             # Vitest
pnpm test:coverage    # With coverage
```

### Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js >= 20, TypeScript (strict ESM) |
| CLI | Commander.js |
| TUI | Ink (React for terminals) |
| AI | Anthropic SDK, OpenAI SDK, Google GenAI, Ollama |
| Blockchain | viem (EVM), Solana, Sui, Aptos, TON adapters |
| Dashboard | Next.js 15, React 19, Tailwind CSS 4 |
| Database | better-sqlite3 + PostgreSQL (pg) |
| ML Sidecar | Python FastAPI, scikit-learn, PyTorch |
| API | Fastify + Swagger/OpenAPI |
| Bots | discord.js, grammY |
| Build | tsup |
| Test | Vitest |

---

## License

[BUSL-1.1](LICENSE.md) -- Business Source License 1.1

---

<p align="center">
  <strong>Built by <a href="https://7aylabs.com">7ayLabs</a></strong>
</p>
