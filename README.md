# Vizzor

**AI-powered crypto chronovisor — on-chain intelligence for the future**

[![CI](https://github.com/7ayLabs/vizzor/actions/workflows/ci.yml/badge.svg)](https://github.com/7ayLabs/vizzor/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@vizzor/cli)](https://www.npmjs.com/package/@vizzor/cli)
[![License: BUSL-1.1](https://img.shields.io/badge/License-BUSL--1.1-blue.svg)](LICENSE.md)

Vizzor is a multi-platform crypto intelligence tool that combines direct on-chain data with AI-powered analysis to help you see the future of blockchain. Available as a CLI tool, Discord bot, and Telegram bot.

## Features

### Project Scanner & ICO Tracker
Analyze crypto projects with AI-enhanced evaluation: tokenomics, team assessment, contract analysis, and risk scoring. Track upcoming ICOs/IDOs with automated risk evaluation.

### Trend Predictor
Market trend analysis powered by AI. Sentiment analysis across social media, price/momentum predictions, and market intelligence.

### On-Chain Forensics
Deep wallet analysis, token flow tracking, whale movement detection, smart contract auditing, and rug pull detection.

### Multi-Platform
- **CLI** — Full-featured terminal interface for developers and power users
- **Discord Bot** — Community-facing crypto intelligence with rich embeds
- **Telegram Bot** — Mobile-first alerts and conversational analysis

## Installation

```bash
npm install -g @vizzor/cli
```

Or run directly:

```bash
npx @vizzor/cli scan ethereum
```

## Quick Start

```bash
# Initialize configuration
vizzor config init

# Scan a crypto project
vizzor scan ethereum

# Deep scan with contract audit
vizzor scan uniswap --deep

# Check market trends
vizzor trends

# Track a wallet
vizzor track 0x1234...abcd

# List upcoming ICOs
vizzor ico list

# Audit a smart contract
vizzor audit 0x1234...abcd --chain ethereum

# Conversational AI mode
vizzor chat

# Start bots
vizzor bot start --discord
vizzor bot start --telegram
vizzor bot start --all
```

## Configuration

Vizzor stores configuration at `~/.vizzor/config.yaml`:

```yaml
# Required
anthropicApiKey: "sk-ant-..."
etherscanApiKey: "..."

# Optional
alchemyApiKey: "..."
coingeckoApiKey: "..."

# Bot tokens (required for bot mode)
discordToken: "..."
discordGuildId: "..."
telegramToken: "..."

# Defaults
defaultChain: ethereum

# Custom RPC endpoints
rpc:
  ethereum: "https://eth-mainnet.g.alchemy.com/v2/..."
  polygon: "https://polygon-mainnet.g.alchemy.com/v2/..."

# AI settings
ai:
  model: "claude-sonnet-4-20250514"
  maxTokens: 4096

# Output preferences
output:
  format: table  # table | json | markdown
  color: true
  verbose: false
```

Environment variables override config file values:

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude AI analysis |
| `ETHERSCAN_API_KEY` | Transaction history, contract source |
| `ALCHEMY_API_KEY` | Premium RPC endpoints |
| `COINGECKO_API_KEY` | Market data |
| `DISCORD_TOKEN` | Discord bot |
| `DISCORD_GUILD_ID` | Discord dev server |
| `TELEGRAM_BOT_TOKEN` | Telegram bot |

## Supported Chains

| Chain | Status | Adapter |
|-------|--------|---------|
| Ethereum | Supported | EVM |
| Polygon | Supported | EVM |
| Arbitrum | Supported | EVM |
| Optimism | Supported | EVM |
| Base | Supported | EVM |
| Solana | Planned | — |
| Bitcoin | Planned | — |
| 7aychain | Planned | — |

Vizzor uses a plugin-based chain adapter system. New chains can be added by implementing the `ChainAdapter` interface.

## Architecture

```
                    +-------------------+
                    |    Interfaces      |
                    |  CLI | Discord |   |
                    |      Telegram     |
                    +--------+----------+
                             |
                    +--------v----------+
                    |  Response Adapters |
                    |  (platform format) |
                    +--------+----------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v---+  +------v------+  +----v--------+
     |  Scanner   |  |   Trends    |  |  Forensics  |
     |  Module    |  |   Module    |  |   Module    |
     +--------+---+  +------+------+  +----+--------+
              |              |              |
     +--------v--------------v--------------v--------+
     |              AI Integration (Claude)           |
     +--------+--------------------------------------+
              |
     +--------v--------------------------------------+
     |         Chain Adapters (EVM, Solana, ...)      |
     +--------+--------------------------------------+
              |
     +--------v----------+
     |  Data Layer        |
     |  SQLite | Cache    |
     +-------------------+
```

## Bot Setup

### Discord

1. Create a bot at [Discord Developer Portal](https://discord.com/developers/applications)
2. Enable the `applications.commands` scope
3. Add the bot token to your config: `vizzor config set discordToken YOUR_TOKEN`
4. Start: `vizzor bot start --discord`

### Telegram

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Add the token to your config: `vizzor config set telegramToken YOUR_TOKEN`
3. Start: `vizzor bot start --telegram`

## Development

```bash
# Clone
git clone https://github.com/7ayLabs/vizzor.git
cd vizzor

# Install dependencies
pnpm install

# Run in development
pnpm dev scan ethereum

# Build
pnpm build

# Test
pnpm test

# Lint & format
pnpm lint
pnpm format:check
pnpm typecheck
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## Contributing

We welcome contributions. Please read our [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before submitting a pull request.

## License

[BUSL-1.1](LICENSE.md) — Business Source License 1.1

## Built by [7ayLabs](https://7aylabs.com)
