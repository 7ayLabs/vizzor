# Vizzor — Development Guide

## Overview

Vizzor is an AI-powered crypto chronovisor CLI + Discord/Telegram bot by 7ayLabs. It combines on-chain data (via chain adapters) with Claude AI analysis to scan projects, predict trends, and perform on-chain forensics.

## Build & Run

```bash
pnpm install          # Install dependencies
pnpm dev              # Run CLI in dev mode (tsx)
pnpm build            # Build with tsup
pnpm lint             # ESLint
pnpm format:check     # Prettier check
pnpm typecheck        # TypeScript check
pnpm test             # Vitest unit tests
pnpm test:coverage    # With coverage
pnpm test:integration # Integration tests (needs API keys)
```

## Architecture

- **Lean Monolith**: single package, internal module boundaries
- **Core modules** (scanner, trends, forensics) are platform-agnostic
- **Adapters** render `VizzorResponse` to CLI/Discord/Telegram formats
- **Chain adapters** implement `ChainAdapter` interface (plugin system)
- **AI layer** uses Anthropic SDK with tool-use for chat mode

## File Structure

```
src/
  index.ts              # Entry point
  cli/commands/          # Commander.js commands
  discord/              # Discord.js bot
  telegram/             # grammY bot
  adapters/             # Platform response renderers
  core/scanner/         # Project analysis, ICO tracking
  core/trends/          # Market trends, sentiment
  core/forensics/       # Wallet analysis, rug detection
  ai/                   # Claude API integration + prompts
  chains/               # ChainAdapter interface + EVM adapter
  data/                 # SQLite cache, storage
  config/               # Zod schema, YAML loader
  utils/                # Logger, spinner, formatting
```

## Code Conventions

- TypeScript strict mode, ESM (`"type": "module"`)
- Path aliases: `@/*` maps to `src/*`
- Use `.js` extensions in relative imports
- Prefer `type` imports: `import type { Foo } from './bar.js'`
- No `any` — use `unknown` and narrow
- Conventional commits: `<type>(<scope>): <description>`
- Scopes: cli, scanner, trends, forensics, ai, chains, data, config, discord, telegram, adapters, ci, deps

## Git Strategy

- `main` → `testing` → `develop` → `feat/*`, `fix/*`
- Feature branches from `develop`, PRs back to `develop`
- Release branches `release/v0.x.x` from `develop` → `testing` → `main`
- Tags on `main` only: `v0.1.0`, `v0.2.0`

## Key Interfaces

- `ChainAdapter` (src/chains/types.ts) — read-only blockchain access
- `VizzorResponse` (src/adapters/types.ts) — platform-agnostic response format
- `VizzorConfig` (src/config/schema.ts) — Zod-validated configuration

## Config

User config at `~/.vizzor/config.yaml`. Env vars override file values.
Required: `ANTHROPIC_API_KEY`, `ETHERSCAN_API_KEY`
Optional: `ALCHEMY_API_KEY`, `DISCORD_TOKEN`, `TELEGRAM_BOT_TOKEN`
