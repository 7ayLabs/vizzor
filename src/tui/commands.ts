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
import { getConfig, saveConfigValue, getSettableKeys } from '../config/loader.js';
import { DEFAULT_CHAIN } from '../config/constants.js';
import { fetchTopGainersLosers } from '../data/sources/binance.js';
import {
  createAgent,
  listAgents,
  deleteAgent,
  startAgent,
  stopAgent,
  getAgentStatus,
  getRecentDecisions,
  listStrategies,
  getAgentByName,
} from '../core/agent/index.js';
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
  if (value.length <= 4) return '****';
  if (value.length <= 8) return value.slice(0, 1) + '****' + value.slice(-1);
  return value.slice(0, 2) + '*'.repeat(Math.min(value.length - 4, 12)) + value.slice(-2);
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
      return handleConfig(args);
    case 'agent':
      return handleAgent(args);
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

function handleAgent(args: string[]): CommandResult {
  const sub = args[0];

  if (!sub) {
    return {
      blocks: [],
      text: [
        'Usage: /agent <subcommand>',
        '',
        '  create <name> --strategy <name> --pairs <SYM1,SYM2> [--interval <sec>]',
        '  list                    List all agents',
        '  start <name>            Start an agent',
        '  stop <name>             Stop a running agent',
        '  status <name>           View agent status and recent decisions',
        '  delete <name>           Delete an agent',
        '  strategies              List available strategies',
      ].join('\n'),
    };
  }

  try {
    switch (sub) {
      case 'create': {
        const nameArg = args[1];
        if (!nameArg)
          return {
            blocks: [],
            text: 'Usage: /agent create <name> --strategy <name> --pairs <SYM1,SYM2>',
          };

        const stratIdx = args.indexOf('--strategy');
        const pairsIdx = args.indexOf('--pairs');
        const intervalIdx = args.indexOf('--interval');

        const strategy =
          stratIdx !== -1 && stratIdx + 1 < args.length ? args[stratIdx + 1]! : 'momentum';
        const pairsRaw =
          pairsIdx !== -1 && pairsIdx + 1 < args.length ? args[pairsIdx + 1]! : 'BTC,ETH';
        const interval =
          intervalIdx !== -1 && intervalIdx + 1 < args.length
            ? parseInt(args[intervalIdx + 1]!, 10)
            : 60;

        const pairs = pairsRaw.split(',').map((p) => p.trim().toUpperCase());
        const agent = createAgent(nameArg, strategy, pairs, interval);
        return {
          blocks: [],
          text: `Agent "${agent.name}" created (${agent.strategy}, pairs: ${agent.pairs.join(', ')}, interval: ${agent.interval}s)`,
        };
      }

      case 'list': {
        const agents = listAgents();
        if (agents.length === 0)
          return { blocks: [], text: 'No agents created. Use /agent create to create one.' };

        const lines = ['Agents:', ''];
        for (const a of agents) {
          const status = getAgentStatus(a.id);
          const statusTag = status?.status ?? 'idle';
          lines.push(
            `  ${a.name} [${statusTag}] — ${a.strategy} | ${a.pairs.join(', ')} | ${a.interval}s`,
          );
        }
        return { blocks: [], text: lines.join('\n') };
      }

      case 'start': {
        const name = args[1];
        if (!name) return { blocks: [], text: 'Usage: /agent start <name>' };
        const agent = getAgentByName(name);
        if (!agent) return { blocks: [], text: `Agent "${name}" not found.` };
        const state = startAgent(agent.id);
        return {
          blocks: [],
          text: `Agent "${name}" started (${state.config.strategy}). Monitoring ${state.config.pairs.join(', ')}.`,
        };
      }

      case 'stop': {
        const name = args[1];
        if (!name) return { blocks: [], text: 'Usage: /agent stop <name>' };
        const agent = getAgentByName(name);
        if (!agent) return { blocks: [], text: `Agent "${name}" not found.` };
        const state = stopAgent(agent.id);
        return { blocks: [], text: `Agent "${name}" stopped after ${state.cycleCount} cycles.` };
      }

      case 'status': {
        const name = args[1];
        if (!name) return { blocks: [], text: 'Usage: /agent status <name>' };
        const agent = getAgentByName(name);
        if (!agent) return { blocks: [], text: `Agent "${name}" not found.` };
        const state = getAgentStatus(agent.id);
        if (!state) return { blocks: [], text: `Agent "${name}" not found.` };

        const lines = [
          `Agent: ${state.config.name}`,
          `  Status: ${state.status}`,
          `  Strategy: ${state.config.strategy}`,
          `  Pairs: ${state.config.pairs.join(', ')}`,
          `  Interval: ${state.config.interval}s`,
          `  Cycles: ${state.cycleCount}`,
        ];

        if (state.error) lines.push(`  Error: ${state.error}`);

        const decisions = getRecentDecisions(agent.id, 5);
        if (decisions.length > 0) {
          lines.push('', '  Recent decisions:');
          for (const d of decisions) {
            const time = new Date(d.timestamp).toLocaleTimeString();
            lines.push(
              `    [${time}] ${d.symbol}: ${d.decision.action.toUpperCase()} (${d.decision.confidence}%)`,
            );
            for (const r of d.decision.reasoning.slice(0, 2)) {
              lines.push(`      - ${r}`);
            }
          }
        }

        return { blocks: [], text: lines.join('\n') };
      }

      case 'delete': {
        const name = args[1];
        if (!name) return { blocks: [], text: 'Usage: /agent delete <name>' };
        const agent = getAgentByName(name);
        if (!agent) return { blocks: [], text: `Agent "${name}" not found.` };
        deleteAgent(agent.id);
        return { blocks: [], text: `Agent "${name}" deleted.` };
      }

      case 'strategies': {
        const strats = listStrategies();
        return { blocks: [], text: `Available strategies: ${strats.join(', ')}` };
      }

      default:
        return { blocks: [], text: `Unknown agent subcommand: ${sub}. Type /agent for help.` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { blocks: [], text: `Agent error: ${message}` };
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
    '  /agent <sub>                         Manage autonomous trading agents',
    '  /provider [list|<name>]              Show/switch AI provider',
    '  /config [set <key> <value>]           Show or update configuration',
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

async function handleConfig(args: string[]): Promise<CommandResult> {
  // /config set <key> <value>
  if (args[0] === 'set') {
    const key = args[1];
    const value = args.slice(2).join(' ');
    if (!key || !value) {
      return {
        blocks: [],
        text:
          'Usage: /config set <key> <value>\n\nValid keys: ' +
          Object.keys(getSettableKeys()).join(', '),
      };
    }
    // Validate sensitive keys for security
    const isSensitive = key.toLowerCase().includes('key') || key.toLowerCase().includes('token');
    if (isSensitive) {
      const { validateKey } = await import('../config/keys.js');
      const error = validateKey(key, value);
      if (error && !error.startsWith('Warning:')) {
        return { blocks: [], text: `Rejected: ${error}` };
      }
    }
    try {
      saveConfigValue(key, value);
      return { blocks: [], text: `Saved ${key}. Config reloaded.` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { blocks: [], text: `Config set failed: ${message}` };
    }
  }

  try {
    const cfg = getConfig();
    const settable = getSettableKeys();

    let activeModel: string;
    try {
      getProvider();
      activeModel = cfg.ai.model ?? DEFAULT_MODELS[cfg.ai.provider] ?? '(default)';
    } catch {
      activeModel = cfg.ai.model ?? '(default)';
    }

    const apiKeys: { label: string; key: string; value: string | undefined; env: string }[] = [
      {
        label: 'Anthropic API Key',
        key: 'anthropicApiKey',
        value: cfg.anthropicApiKey,
        env: settable['anthropicApiKey']?.env ?? '',
      },
      {
        label: 'OpenAI API Key',
        key: 'openaiApiKey',
        value: cfg.openaiApiKey,
        env: settable['openaiApiKey']?.env ?? '',
      },
      {
        label: 'Google API Key',
        key: 'googleApiKey',
        value: cfg.googleApiKey,
        env: settable['googleApiKey']?.env ?? '',
      },
      {
        label: 'Etherscan API Key',
        key: 'etherscanApiKey',
        value: cfg.etherscanApiKey,
        env: settable['etherscanApiKey']?.env ?? '',
      },
      {
        label: 'Alchemy API Key',
        key: 'alchemyApiKey',
        value: cfg.alchemyApiKey,
        env: settable['alchemyApiKey']?.env ?? '',
      },
      {
        label: 'CoinGecko API Key',
        key: 'coingeckoApiKey',
        value: cfg.coingeckoApiKey,
        env: settable['coingeckoApiKey']?.env ?? '',
      },
      {
        label: 'CryptoPanic Key',
        key: 'cryptopanicApiKey',
        value: cfg.cryptopanicApiKey,
        env: settable['cryptopanicApiKey']?.env ?? '',
      },
    ];

    let configured = 0;
    const keyLines: string[] = [];
    for (const k of apiKeys) {
      const masked = maskKey(k.value);
      if (k.value) configured++;
      const hint = k.value ? '' : `  -> /config set ${k.key} <value> or ${k.env}=xxx`;
      keyLines.push(`  ${k.label.padEnd(20)} ${masked}${hint}`);
    }

    const text = [
      'Configuration:',
      '',
      '  [AI Provider]',
      `  Provider:           ${cfg.ai.provider}`,
      `  Model:              ${activeModel}`,
      `  Max Tokens:         ${cfg.ai.maxTokens}`,
      `  Ollama Host:        ${cfg.ai.ollamaHost}`,
      '',
      `  [API Keys] (${configured}/${apiKeys.length} configured)`,
      ...keyLines,
      '',
      '  [Chain]',
      `  Default Chain:      ${cfg.defaultChain}`,
      '',
      '  [Output]',
      `  Format:             ${cfg.output.format}`,
      `  Color:              ${cfg.output.color}`,
      `  Verbose:            ${cfg.output.verbose}`,
      '',
      'Set a value: /config set <key> <value>',
    ].join('\n');

    return { blocks: [], text };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { blocks: [], text: `Config error: ${message}` };
  }
}
