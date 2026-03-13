// ---------------------------------------------------------------------------
// Slash command parser and dispatcher for the Vizzor TUI
// ---------------------------------------------------------------------------

import type { RichBlock } from './components/message-list.js';
import { getAdapter } from '../chains/registry.js';
import { analyzeProject } from '../core/scanner/project-analyzer.js';
import { assessRisk } from '../core/scanner/risk-scorer.js';
import { fetchTrendingTokens } from '../core/trends/market.js';
import { analyzeWallet } from '../core/forensics/wallet-analyzer.js';
import { auditContract } from '../core/forensics/contract-auditor.js';
import { getConfig } from '../config/loader.js';
import { DEFAULT_CHAIN } from '../config/constants.js';
import { fetchTopGainersLosers } from '../data/sources/binance.js';
import { getProvider, switchProvider } from '../ai/client.js';
import { getAvailableProviders } from '../ai/providers/registry.js';
import { DEFAULT_MODELS } from '../ai/providers/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandResult {
  blocks: RichBlock[];
  text: string;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Check whether the given input string is a slash command (starts with `/`).
 */
export function isSlashCommand(input: string): boolean {
  return input.trimStart().startsWith('/');
}

/**
 * Parse a slash command string into a command name and arguments array.
 *
 * @example
 * parseCommand('/scan 0xabc --chain polygon')
 * // => { name: 'scan', args: ['0xabc', '--chain', 'polygon'] }
 */
export function parseCommand(input: string): { name: string; args: string[] } {
  const trimmed = input.trimStart();
  const parts = trimmed.split(/\s+/);
  const raw = parts[0] ?? '/help';
  // Strip the leading `/`
  const name = raw.startsWith('/') ? raw.slice(1) : raw;
  const args = parts.slice(1);
  return { name, args };
}

// ---------------------------------------------------------------------------
// Flag helpers
// ---------------------------------------------------------------------------

/**
 * Extract the `--chain <value>` flag from an args array, defaulting to
 * `'ethereum'` when absent.
 */
function extractChainFlag(args: string[]): string {
  const idx = args.indexOf('--chain');
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1] ?? DEFAULT_CHAIN;
  }
  return DEFAULT_CHAIN;
}

/**
 * Return positional args (everything that is not `--chain` or its value).
 */
function positionalArgs(args: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--chain') {
      i++; // skip the next arg (chain value)
      continue;
    }
    const arg = args[i];
    if (arg !== undefined) result.push(arg);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Mask helper (for /config)
// ---------------------------------------------------------------------------

function maskKey(value: string | undefined): string {
  if (!value) return '(not set)';
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

// ---------------------------------------------------------------------------
// Command executor
// ---------------------------------------------------------------------------

/**
 * Execute a parsed slash command by name and return a {@link CommandResult}.
 *
 * The `/clear` and `/exit` commands return a result with empty text so the
 * caller (the app component) can handle them specially.
 */
export async function executeCommand(name: string, args: string[]): Promise<CommandResult> {
  switch (name) {
    case 'scan':
      return handleScan(args);
    case 'track':
      return handleTrack(args);
    case 'trends':
      return handleTrends();
    case 'audit':
      return handleAudit(args);
    case 'help':
      return handleHelp();
    case 'provider':
      return handleProvider(args);
    case 'config':
      return handleConfig();
    case 'clear':
      return { blocks: [], text: '' };
    case 'exit':
      return { blocks: [], text: '' };
    default:
      return {
        blocks: [],
        text: `Unknown command: /${name}. Type /help for available commands.`,
      };
  }
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function handleScan(args: string[]): Promise<CommandResult> {
  const chain = extractChainFlag(args);
  const positional = positionalArgs(args);
  const address = positional[0];

  if (!address) {
    return { blocks: [], text: 'Usage: /scan <address> [--chain <chain>]' };
  }

  try {
    const adapter = getAdapter(chain);
    const analysis = await analyzeProject(address, adapter);
    const risk = assessRisk(analysis);

    const blocks: RichBlock[] = [
      {
        type: 'risk',
        data: { score: risk.score, level: risk.level, factors: risk.factors },
      },
    ];

    if (analysis.token) {
      blocks.push({
        type: 'token',
        data: {
          name: analysis.token.name,
          symbol: analysis.token.symbol,
          decimals: analysis.token.decimals,
          totalSupply: analysis.token.totalSupply.toString(),
        },
      });
    }

    return {
      blocks,
      text: `Scan complete for ${address} on ${chain}. ${risk.summary}`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { blocks: [], text: `Scan failed: ${message}` };
  }
}

async function handleTrack(args: string[]): Promise<CommandResult> {
  const chain = extractChainFlag(args);
  const positional = positionalArgs(args);
  const wallet = positional[0];

  if (!wallet) {
    return { blocks: [], text: 'Usage: /track <wallet> [--chain <chain>]' };
  }

  try {
    const adapter = getAdapter(chain);
    const analysis = await analyzeWallet(wallet, adapter);

    const patternSummary =
      analysis.patterns.length > 0
        ? analysis.patterns.map((p) => `- [${p.severity}] ${p.description}`).join('\n')
        : 'No unusual patterns detected.';

    const text = [
      `Wallet analysis for ${analysis.address} on ${analysis.chain}:`,
      `  Balance: ${analysis.balance.toString()} wei`,
      `  Transactions: ${analysis.transactionCount}`,
      `  Risk level: ${analysis.riskLevel}`,
      `  Patterns:`,
      patternSummary,
    ].join('\n');

    return { blocks: [], text };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { blocks: [], text: `Track failed: ${message}` };
  }
}

async function handleTrends(): Promise<CommandResult> {
  // Fetch trending tokens + top gainers/losers in parallel (no hardcoded symbols)
  const [trendingResult, gainersLosersResult] = await Promise.allSettled([
    fetchTrendingTokens(),
    fetchTopGainersLosers(5),
  ]);

  const blocks: RichBlock[] = [];
  const lines: string[] = [];

  // Merge and deduplicate trending tokens
  const trending = trendingResult.status === 'fulfilled' ? trendingResult.value : [];
  const seen = new Set<string>();

  if (trending.length > 0) {
    lines.push('Trending tokens:');
    for (const t of trending.slice(0, 10)) {
      const key = t.symbol.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const change =
        t.priceChange24h > 0
          ? `+${t.priceChange24h.toFixed(1)}%`
          : `${t.priceChange24h.toFixed(1)}%`;
      blocks.push({
        type: 'market',
        data: {
          symbol: t.symbol,
          price: parseFloat(t.priceUsd) || 0,
          change24h: t.priceChange24h,
          volume: t.volume24h,
        },
      });
      lines.push(
        `  ${t.symbol} (${t.chain}): $${t.priceUsd} | 24h: ${change} | Vol: $${t.volume24h.toLocaleString()} [${t.source}]`,
      );
    }
  }

  // Top gainers and losers from Binance
  if (gainersLosersResult.status === 'fulfilled') {
    const { gainers, losers } = gainersLosersResult.value;
    if (gainers.length > 0) {
      lines.push('');
      lines.push('Top gainers (24h):');
      for (const g of gainers) {
        if (seen.has(g.symbol)) continue;
        lines.push(
          `  ${g.symbol}: $${g.price.toLocaleString()} | +${g.change24h.toFixed(1)}% | Vol: $${g.quoteVolume.toLocaleString()}`,
        );
      }
    }
    if (losers.length > 0) {
      lines.push('');
      lines.push('Top losers (24h):');
      for (const l of losers) {
        if (seen.has(l.symbol)) continue;
        lines.push(
          `  ${l.symbol}: $${l.price.toLocaleString()} | ${l.change24h.toFixed(1)}% | Vol: $${l.quoteVolume.toLocaleString()}`,
        );
      }
    }
  }

  if (lines.length === 0) {
    return { blocks: [], text: 'Could not fetch market trends. Try again later.' };
  }

  return { blocks, text: lines.join('\n') };
}

async function handleAudit(args: string[]): Promise<CommandResult> {
  const chain = extractChainFlag(args);
  const positional = positionalArgs(args);
  const contract = positional[0];

  if (!contract) {
    return { blocks: [], text: 'Usage: /audit <contract> [--chain <chain>]' };
  }

  try {
    const adapter = getAdapter(chain);
    const result = await auditContract(contract, adapter);

    const blocks: RichBlock[] = [
      {
        type: 'audit',
        data: {
          findings: result.findings.map((f) => ({
            severity: f.severity,
            description: `${f.title}: ${f.description}`,
          })),
        },
      },
    ];

    return {
      blocks,
      text: `Audit for ${contract} on ${chain}: overall risk is ${result.overallRisk}. ${result.findings.length} finding(s).`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { blocks: [], text: `Audit failed: ${message}` };
  }
}

function handleProvider(args: string[]): CommandResult {
  const subcommand = args[0];

  // /provider — show current
  if (!subcommand) {
    try {
      const provider = getProvider();
      return {
        blocks: [],
        text: `Current AI provider: ${provider.name}`,
      };
    } catch {
      return { blocks: [], text: 'No AI provider is currently active.' };
    }
  }

  // /provider list — show all with availability
  if (subcommand === 'list') {
    try {
      const cfg = getConfig();
      const providers = getAvailableProviders(cfg);
      let current = '';
      try {
        current = getProvider().name;
      } catch {
        // no active provider
      }

      const lines = ['Available AI providers:', ''];
      for (const p of providers) {
        const active = p.name === current ? ' (active)' : '';
        const model = DEFAULT_MODELS[p.name] ?? 'unknown';
        const status = p.available ? 'ready' : (p.reason ?? 'unavailable');
        lines.push(`  ${p.name}${active} — ${model} [${status}]`);
      }
      lines.push('', 'Switch with: /provider <name>');
      return { blocks: [], text: lines.join('\n') };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { blocks: [], text: `Provider list error: ${message}` };
    }
  }

  // /provider <name> — switch provider
  const validProviders = ['anthropic', 'openai', 'gemini', 'ollama'];
  if (!validProviders.includes(subcommand)) {
    return {
      blocks: [],
      text: `Unknown provider "${subcommand}". Available: ${validProviders.join(', ')}`,
    };
  }

  try {
    switchProvider(subcommand);
    const provider = getProvider();
    return {
      blocks: [],
      text: `Switched to ${provider.name}. Ready to chat.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { blocks: [], text: `Failed to switch provider: ${message}` };
  }
}

function handleHelp(): CommandResult {
  const text = [
    'Available commands:',
    '',
    '  /scan <address> [--chain <chain>]    Scan a token/project for risk indicators',
    '  /track <wallet> [--chain <chain>]    Analyze a wallet address',
    '  /trends                              Live trending tokens + top gainers/losers',
    '  /audit <contract> [--chain <chain>]  Audit a smart contract (bytecode scanning)',
    '  /provider [list|<name>]              Show/switch AI provider',
    '  /config                              Show current configuration (keys masked)',
    '  /clear                               Clear message history',
    '  /exit                                Exit Vizzor',
    '  /help                                Show this help message',
    '',
    'AI chat supports: token search (DexScreener), trending, news, raises,',
    'market data, wallet analysis, rug detection, and Pump.fun launches.',
    'Just ask a question — Vizzor fetches live data automatically.',
  ].join('\n');

  return { blocks: [], text };
}

function handleConfig(): CommandResult {
  try {
    const cfg = getConfig();

    let activeModel: string;
    try {
      getProvider(); // ensure a provider is active
      activeModel = cfg.ai.model ?? DEFAULT_MODELS[cfg.ai.provider] ?? '(default)';
    } catch {
      activeModel = cfg.ai.model ?? '(default)';
    }

    const text = [
      'Current configuration:',
      '',
      `  AI Provider:        ${cfg.ai.provider}`,
      `  AI Model:           ${activeModel}`,
      `  Max Tokens:         ${cfg.ai.maxTokens}`,
      `  Anthropic API Key:  ${maskKey(cfg.anthropicApiKey)}`,
      `  OpenAI API Key:     ${maskKey(cfg.openaiApiKey)}`,
      `  Google API Key:     ${maskKey(cfg.googleApiKey)}`,
      `  Etherscan API Key:  ${maskKey(cfg.etherscanApiKey)}`,
      `  Alchemy API Key:    ${maskKey(cfg.alchemyApiKey)}`,
      `  CoinGecko API Key:  ${maskKey(cfg.coingeckoApiKey)}`,
      `  CryptoPanic Key:   ${maskKey(cfg.cryptopanicApiKey)}`,
      `  Default Chain:      ${cfg.defaultChain}`,
      `  Ollama Host:        ${cfg.ai.ollamaHost}`,
      `  Output Format:      ${cfg.output.format}`,
      `  Color:              ${cfg.output.color}`,
      `  Verbose:            ${cfg.output.verbose}`,
    ].join('\n');

    return { blocks: [], text };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { blocks: [], text: `Config error: ${message}` };
  }
}
