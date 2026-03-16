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
  <a href="#requirements">Requirements</a> &bull;
  <a href="#installation">Install</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#usage">Usage</a> &bull;
  <a href="#agents">Agents</a> &bull;
  <a href="#web-dashboard">Dashboard</a> &bull;
  <a href="#api-server">API</a> &bull;
  <a href="#configuration">Config</a>
</p>

---

Vizzor is a crypto market prediction engine. It pulls live data from 7+ APIs, runs technical analysis on raw candles, reads derivatives positioning and market sentiment, then synthesizes price predictions with actual dollar targets across multiple timeframes — from 5 minutes to 3 months.

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

## What It Does

**Any tradable crypto asset.** BTC, ETH, SOL, meme coins, new DEX launches, tokens by contract address — if it has a price, Vizzor can analyze it.

- **Price predictions** — bull/bear/likely targets across 9 timeframes (5m to 3 months)
- **Microstructure analysis** — market structure, FVGs, VWAP, volume delta, liquidation map, order book depth, S/R zones, squeeze detection
- **Token security audits** — honeypot detection, tax analysis, mint/blacklist flags, rug pull indicators
- **On-chain forensics** — wallet analysis, whale tracking, holder concentration, token flow patterns
- **Derivatives positioning** — funding rates, open interest, long/short ratios from Binance Futures
- **Sentiment analysis** — Fear & Greed Index, news sentiment, buy/sell transaction ratios
- **Trending discovery** — what tokens are moving right now across DexScreener and CoinGecko
- **ICO tracking** — upcoming launches, fundraising rounds, investor data
- **Autonomous agents** — set-and-forget trading agents with paper/live execution

---

## Requirements

### Hardware

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 2 cores | 4+ cores |
| **RAM** | 2 GB | 4+ GB (8 GB if running ML sidecar) |
| **Disk** | 500 MB | 2 GB (includes SQLite cache + ML models) |
| **Network** | Stable internet | Low latency to Binance/CoinGecko APIs |
| **GPU** | Not required | Not required (ML models are CPU-based) |

### Software

| Dependency | Version | Notes |
|------------|---------|-------|
| **Node.js** | >= 20.0.0 | ES2022 target, ESM modules |
| **pnpm** | >= 8.0 | Recommended package manager (npm/yarn also work) |
| **Python** | 3.x | Required by `better-sqlite3` native build |
| **C++ compiler** | GCC / Clang / MSVC | Required by `better-sqlite3` native build |
| **Docker** | >= 24 | Optional — for ML sidecar, PostgreSQL, web dashboard |

Works on **macOS**, **Linux**, and **Windows**.

### API Keys

| Key | Required | Free Tier | Purpose |
|-----|----------|-----------|---------|
| `ANTHROPIC_API_KEY` | Yes (or use Ollama) | Pay-per-use | Claude AI — best prediction quality |
| `ETHERSCAN_API_KEY` | Recommended | Yes | Transaction history, contract source |
| `OPENAI_API_KEY` | No | Pay-per-use | GPT-4 as alternative provider |
| `GOOGLE_API_KEY` | No | Free tier | Gemini as alternative provider |
| `ALCHEMY_API_KEY` | No | Free tier | Premium RPC endpoints |
| `COINGECKO_API_KEY` | No | Free tier | Extended market data |
| `CRYPTOPANIC_API_KEY` | No | Free tier | News with sentiment |
| `DISCORD_TOKEN` | No | Free | Discord bot |
| `TELEGRAM_BOT_TOKEN` | No | Free | Telegram bot |

**No API key at all?** Use Ollama with a local model — fully offline predictions (lower quality but free).

---

## Installation

### npm (recommended)

```bash
npm install -g @vizzor/cli
```

```bash
# Or run directly without installing
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
cp .env.example .env     # Configure API keys
docker compose up -d      # Starts CLI + ML sidecar + PostgreSQL + Web Dashboard
```

---

## Quick Start

### Option A: With Claude (best quality)

```bash
# 1. Set your Anthropic API key
vizzor config set anthropicApiKey sk-ant-...
# or: export ANTHROPIC_API_KEY=sk-ant-...

# 2. Launch
vizzor
```

### Option B: With Ollama (free, local, offline)

```bash
# 1. Install Ollama: https://ollama.ai
ollama pull llama3.2    # or qwen2.5:14b for better results

# 2. Configure Vizzor
vizzor config set ai.provider ollama
vizzor config set ai.model llama3.2

# 3. Launch
vizzor
```

### Option C: With OpenAI or Gemini

```bash
vizzor config set ai.provider openai
vizzor config set openaiApiKey sk-...
# or
vizzor config set ai.provider gemini
vizzor config set googleApiKey AI...
```

### Start asking

```
> predict BTC price next week
> analyze $PEPE security and price outlook
> what's trending in crypto right now
> full microstructure analysis for ETH
> track wallet 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
> audit contract 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984
```

---

## Usage

### TUI (Terminal UI)

Launch with `vizzor`. Interactive chat with live price ticker, streaming responses, and slash commands.

**Price Ticker:** Arrow keys to navigate, **Enter** to trigger AI prediction, **Tab** to toggle focus.

| Command | Description |
|---------|-------------|
| `/scan <address> [--chain <chain>]` | Token security + risk scan |
| `/track <wallet> [--chain <chain>]` | Wallet forensics |
| `/trends` | Trending tokens + top gainers/losers |
| `/audit <contract> [--chain <chain>]` | Smart contract audit |
| `/add <symbol>` | Add token to live price ticker |
| `/remove <symbol>` | Remove token from ticker |
| `/chain [<id>]` | Show/switch chain |
| `/provider` | Show current AI provider |
| `/provider <name>` | Switch to `anthropic`, `openai`, `gemini`, `ollama` |
| `/agent create <name> [options]` | Create autonomous agent |
| `/agent list` | List agents |
| `/agent start <name>` | Start agent |
| `/agent stop <name>` | Stop agent |
| `/agent status <name>` | Agent status + decisions |
| `/backtest` | Historical strategy backtest |
| `/config` | Show config |
| `/help` | Command reference |

### CLI Commands

```bash
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
vizzor api start [--port 3100]      # Start REST API server
vizzor api key create "my-app"      # Create API key
```

### Discord Bot

Requires `DISCORD_TOKEN`. Enable the `MESSAGE_CONTENT` privileged intent in the [Discord Developer Portal](https://discord.com/developers/applications).

| Command | Description |
|---------|-------------|
| `/predict <symbol>` | AI prediction with signals |
| `/scan <address>` | Token security scan |
| `/trends` | Trending tokens |
| `/track <wallet>` | Wallet forensics |
| `/price <symbol>` | Live price |
| `/audit <contract>` | Contract audit |
| `/ico` | Upcoming launches |
| `/agent_create` | Create agent |
| *@mention* | AI-powered chat |

### Telegram Bot

Requires `TELEGRAM_BOT_TOKEN`.

Same commands as Discord (`/predict`, `/scan`, `/trends`, `/track`, `/price`, `/audit`, `/ico`, `/agent_create`). Any text message triggers AI chat.

---

## Agents

Autonomous prediction agents that run a continuous **think → analyze → decide → act** cycle.

### Agent Requirements

| Requirement | Details |
|-------------|---------|
| **AI Provider** | Any (Claude recommended for best decisions) |
| **Wallet** | Required for live trading; not needed for paper trading or alert-only |
| **RPC Endpoint** | Required for live trading (default public RPCs or Alchemy) |
| **Minimum Balance** | Agent-specific; configurable spending limits |
| **Always-on Process** | Agent runs in a loop — needs a persistent process (terminal, tmux, Docker, etc.) |

### Create and Run

```bash
# Create an agent
/agent create alpha --strategy momentum --pairs BTC,ETH,SOL --interval 60

# Start it
/agent start alpha

# Check status
/agent status alpha

# Stop it
/agent stop alpha
```

### Execution Modes

| Mode | Description | Wallet Required |
|------|-------------|-----------------|
| **Alert-only** | Generates signals, no trades | No |
| **Paper trading** | Simulated trades with realistic slippage model | No |
| **Live trading** | On-chain execution via DEX router | Yes |

### Strategies

| Strategy | Signals | Best For |
|----------|---------|----------|
| **Momentum** | RSI + MACD + Bollinger + Funding | Short-term reversals |
| **Trend-Following** | EMA Crossover + OBV + Fear & Greed | Swing trades |
| **ML-Adaptive** | All TA + ML regime + ChronoVisor | Adaptive, all conditions |

### Safety Pipeline (Live Trading)

Live trades pass through a 7-step pipeline before execution:

1. **Validate** — check parameters, balance, spending limits
2. **Prepare** — build transaction with DEX router quote
3. **Simulate** — `eth_call` dry run to detect reverts
4. **Approve** — ERC-20 token approval if needed
5. **Execute** — submit on-chain transaction
6. **Record** — log to portfolio + audit trail
7. **Cleanup** — update positions, trigger alerts

Additional protections:
- Per-agent daily/weekly spending caps
- Kelly criterion position sizing
- ATR-based stop losses
- Max drawdown limits
- Global emergency kill switch (`/agent emergency-stop`)

### Wallet Setup

```bash
vizzor wallet create           # Generate new encrypted wallet
vizzor wallet import           # Import existing private key
vizzor wallet list             # List managed wallets
```

Wallets are encrypted with AES-256-GCM (scrypt N=2^18) and stored at `~/.vizzor/wallets/`.

### Backtesting

Test strategies against historical data before going live:

```bash
vizzor backtest --strategy momentum --pair BTCUSDT --from 2024-01-01 --to 2024-12-31
```

Metrics: total return, win rate, profit factor, Sharpe ratio, max drawdown, equity curve.

---

## Web Dashboard

Next.js 15 dashboard at `http://localhost:3001`.

### Setup

```bash
# Option 1: Docker (recommended)
docker compose up web

# Option 2: From source
cd web
pnpm install
pnpm dev
```

Requires the API server running (`vizzor api start`).

### Pages

- **AI Chat** — conversational interface with streaming, tool call progress, trade action cards
- **Dashboard** — market overview, Fear & Greed, sentiment, regime, trending tokens, news
- **Markets** — token analysis, wallet analyzer, on-chain intelligence
- **Agents** — create, monitor, start/stop agents with paper/live mode
- **Portfolio** — positions, trade history, P&L metrics
- **Settings** — API keys and provider configuration

---

## API Server

REST API exposing all Vizzor capabilities programmatically.

### Setup

```bash
vizzor api start --port 3100      # Start server
vizzor api key create "my-app"    # Create API key
```

All endpoints require `X-API-Key` header. Rate limited to 300 req/min per key.

### Endpoints

```
GET  /health                    # Health check (public)
GET  /docs                      # Swagger UI
POST /v1/chat                   # AI chat (SSE streaming)
POST /v1/chat/thread            # Threaded chat reply
GET  /v1/market/price/:symbol   # Price
GET  /v1/market/prices?symbols= # Batch prices
GET  /v1/market/trending        # Trending tokens
GET  /v1/market/fear-greed      # Fear & Greed Index
GET  /v1/market/ml-health       # ML sidecar status
GET  /v1/market/trenches        # Trenches scanner
GET  /v1/chronovisor/:symbol    # ChronoVisor prediction
POST /scan                      # Token security scan
POST /trends                    # Market trends
POST /track                     # Wallet forensics
POST /predict                   # AI prediction
POST /audit                     # Contract audit
POST /v1/backtest               # Backtest
GET  /v1/agents                 # List agents
POST /v1/agents                 # Create agent
POST /v1/agents/:name/start    # Start agent
POST /v1/agents/:name/stop     # Stop agent
GET  /v1/portfolio/:id          # Portfolio
POST /v1/agents/emergency-stop  # Global kill switch
WS   /ws                        # WebSocket real-time push
```

---

## Supported Chains

| Chain | Status |
|-------|--------|
| Ethereum | Live |
| Polygon | Live |
| Arbitrum | Live |
| Optimism | Live |
| Base | Live |
| BSC | Live |
| Avalanche | Live |
| Solana | Live |
| Sui | Live |
| Aptos | Live |
| TON | Live |

---

## Configuration

Config at `~/.vizzor/config.yaml`. Environment variables override file values.

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

### AI Provider Comparison

| Provider | Quality | Cost | Latency | Tool Support | Offline |
|----------|---------|------|---------|--------------|---------|
| **Anthropic** (Claude) | Best | Pay-per-use | ~2-5s | Full | No |
| **OpenAI** (GPT-4) | Great | Pay-per-use | ~2-5s | Full | No |
| **Google** (Gemini) | Good | Free tier | ~2-4s | Full | No |
| **Ollama** (local) | Varies | Free | ~5-30s | Context injection | Yes |

---

## ML Sidecar (Optional)

Python FastAPI sidecar with 16 trained models for enhanced predictions. Falls back to heuristics when unavailable.

### Setup

```bash
docker compose up ml-sidecar
curl http://localhost:8000/health
```

### Requirements

| Component | Minimum |
|-----------|---------|
| **RAM** | 4 GB (8 GB recommended) |
| **Disk** | 1 GB for models |
| **Python** | 3.10+ |
| **GPU** | Not required |

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

[BUSL-1.1](LICENSE.md) — Business Source License 1.1

---

<p align="center">
  <strong>Built by <a href="https://7aylabs.com">7ayLabs</a></strong>
</p>
