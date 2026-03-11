// ---------------------------------------------------------------------------
// Slash command parser and dispatcher for the Vizzor TUI
// ---------------------------------------------------------------------------

import type { RichBlock } from './components/message-list.js';
import { getAdapter } from '../chains/registry.js';
import { analyzeProject } from '../core/scanner/project-analyzer.js';
import { assessRisk } from '../core/scanner/risk-scorer.js';
import { fetchMarketData } from '../core/trends/market.js';
import { analyzeWallet } from '../core/forensics/wallet-analyzer.js';
import { auditContract } from '../core/forensics/contract-auditor.js';
import { getConfig } from '../config/loader.js';

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
    return args[idx + 1] ?? 'ethereum';
  }
  return 'ethereum';
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
    result.push(args[i]!);
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
  const symbols = ['bitcoin', 'ethereum', 'solana'];

  const results = await Promise.allSettled(symbols.map((s) => fetchMarketData(s)));

  const blocks: RichBlock[] = [];
  const lines: string[] = ['Market trends:'];

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const symbol = symbols[i]!;
    if (result.status === 'fulfilled' && result.value) {
      const data = result.value;
      blocks.push({
        type: 'market',
        data: {
          symbol: data.symbol,
          price: data.price,
          change24h: data.priceChange24h,
          volume: data.volume24h,
        },
      });
    } else {
      lines.push(`  ${symbol.toUpperCase()}: data unavailable`);
    }
  }

  return {
    blocks,
    text: lines.length > 1 ? lines.join('\n') : 'Market data loaded.',
  };
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

function handleHelp(): CommandResult {
  const text = [
    'Available commands:',
    '',
    '  /scan <address> [--chain <chain>]    Scan a token/project for risk indicators',
    '  /track <wallet> [--chain <chain>]    Analyze a wallet address',
    '  /trends                              Show market trends for BTC, ETH, SOL',
    '  /audit <contract> [--chain <chain>]  Audit a smart contract',
    '  /config                              Show current configuration (keys masked)',
    '  /clear                               Clear message history',
    '  /exit                                Exit Vizzor',
    '  /help                                Show this help message',
    '',
    'Or just type a question to chat with the AI assistant.',
  ].join('\n');

  return { blocks: [], text };
}

function handleConfig(): CommandResult {
  try {
    const cfg = getConfig();

    const text = [
      'Current configuration:',
      '',
      `  Anthropic API Key:  ${maskKey(cfg.anthropicApiKey)}`,
      `  Etherscan API Key:  ${maskKey(cfg.etherscanApiKey)}`,
      `  Alchemy API Key:    ${maskKey(cfg.alchemyApiKey)}`,
      `  CoinGecko API Key:  ${maskKey(cfg.coingeckoApiKey)}`,
      `  Default Chain:      ${cfg.defaultChain}`,
      `  AI Model:           ${cfg.ai.model}`,
      `  Max Tokens:         ${cfg.ai.maxTokens}`,
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
