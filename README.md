<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="vizzor_lighticon.png">
    <source media="(prefers-color-scheme: light)" srcset="vizzor_icon.png">
    <img alt="Vizzor" src="vizzor_icon.png" width="120">
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

Vizzor builds predictions from 5 weighted signal dimensions:

```
Technical Analysis ........... 40%    RSI, MACD, Bollinger, EMA, ATR, OBV
Market Sentiment ............. 20%    Fear & Greed, news sentiment, buy/sell ratio
Derivatives Positioning ...... 20%    Funding rate, open interest, long/short
Trend Momentum ............... 15%    24h/7d price action, volume trends
Macro Cycle ................... 5%    Fear & Greed extremes as contrarian signals
                              ----
Composite Score        -100 to +100
```

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

Vizzor exposes **17+ tools** to the AI. During conversation, the AI autonomously calls whichever tools it needs to build a complete prediction.

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
| **Binance** | Klines, tickers, funding rates, open interest, gainers/losers | Public |
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
GET  /health              # Health check (public)
GET  /docs                # OpenAPI/Swagger UI (dev only)
POST /scan                # Token security scan
POST /trends              # Market trends
POST /track               # Wallet forensics
POST /predict             # AI prediction
POST /audit               # Contract audit
```

All endpoints require `X-API-Key` header. Rate limited to 100 req/min per key. Keys are hashed with scrypt and stored locally.

### Autonomous Agents v2

Portfolio-aware trading agents with risk management:

- **Portfolio Manager** — tracks positions, calculates P&L, manages allocation limits
- **Risk System** — Kelly criterion position sizing, ATR-based stop losses, drawdown limits
- **ML-Adaptive Strategy** — combines RSI, MACD, EMA, Bollinger, funding rate with ML regime detection
- **Strategy Registry** — pluggable strategy system, easy to add custom strategies

### Security & ZK

- **AES-256-GCM encryption** for sensitive data at rest
- **HMAC signatures** for API request integrity
- **Audit logging** for security-critical operations
- **ZK-proof chain adapters** for privacy-preserving verification
- **Input sanitization** across all user-facing surfaces

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
docker compose up -d  # Starts Vizzor + ML sidecar + PostgreSQL + n8n
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

All 13 models integrated across 14 TypeScript modules with graceful fallback to heuristics.

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

> Agents operate in **alert-only mode** -- they log decisions and emit signals but do not execute on-chain transactions.

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
| Solana | Live (DEX + GoPlus) | GoPlus |

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
pnpm test             # Vitest (164 tests, 19 suites)
pnpm test:coverage    # With coverage
```

### Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js >= 20, TypeScript (strict ESM) |
| CLI | Commander.js |
| TUI | Ink (React for terminals) |
| AI | Anthropic SDK, OpenAI SDK, Google GenAI, Ollama |
| Blockchain | viem (EVM), plugin adapter system |
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
