import type { Bot, Context } from 'grammy';
import { getAdapter } from '../../chains/registry.js';
import { getConfig } from '../../config/loader.js';
import { analyzeProject } from '../../core/scanner/project-analyzer.js';
import { assessRisk } from '../../core/scanner/risk-scorer.js';
import { analyzeWallet } from '../../core/forensics/wallet-analyzer.js';
import { auditContract } from '../../core/forensics/contract-auditor.js';
import { fetchTrendingTokens } from '../../core/trends/market.js';
import { fetchUpcomingICOs } from '../../core/scanner/ico-tracker.js';
import { fetchRecentRaises } from '../../data/sources/defillama.js';
import { fetchTickerPrice } from '../../data/sources/binance.js';
import { generatePrediction } from '../../core/trends/predictor.js';
import {
  createAgent,
  listAgents,
  getAgentByName,
  startAgent,
  stopAgent,
  getAgentStatus,
  getRecentDecisions,
  deleteAgent,
  listStrategies,
  getWalletBalance,
  isValidAddress,
} from '../../core/agent/index.js';
import {
  escapeMarkdown,
  formatTrending,
  formatICOs,
  formatAudit,
  formatWalletAnalysis,
} from '../formatters/market.js';

export function registerCommands(bot: Bot): void {
  bot.command('start', (ctx) =>
    ctx.reply(
      '*Welcome to Vizzor* — AI\\-powered crypto chronovisor\\.\n\n' +
        '*Commands:*\n' +
        '/scan \\<address\\> — Analyze a project\n' +
        '/trends — Trending tokens \\+ market movers\n' +
        '/track \\<wallet\\> — Wallet forensics\n' +
        '/ico — Upcoming ICOs \\& raises\n' +
        '/audit \\<contract\\> — Smart contract audit\n' +
        '/price \\<symbol\\> — Quick price check\n' +
        '/predict \\<symbol\\> — AI prediction\n' +
        '/wallet \\<address\\> — Wallet balance\n' +
        '/agent — Trading agent management\n' +
        '/help — Show all commands\n\n' +
        '_Send any message for AI\\-powered analysis_',
      { parse_mode: 'MarkdownV2' },
    ),
  );

  bot.command('help', (ctx) =>
    ctx.reply(
      '*Vizzor Commands*\n\n' +
        '*Analysis:*\n' +
        '/scan \\<address\\> — Analyze token/project risk\n' +
        '/track \\<wallet\\> — Wallet analysis \\& forensics\n' +
        '/trends — Trending tokens from DexScreener\n' +
        '/ico — Upcoming ICOs \\& fundraising rounds\n' +
        '/audit \\<contract\\> — Smart contract audit\n\n' +
        '*Quick Commands:*\n' +
        '/price \\<symbol\\> — Live price check\n' +
        '/predict \\<symbol\\> — AI prediction with signals\n' +
        '/wallet \\<address\\> — ETH wallet balance\n\n' +
        '*Agent Management:*\n' +
        '/agent\\_create \\<name\\> \\<strategy\\> \\<pairs\\>\n' +
        '/agent\\_list — List all agents\n' +
        '/agent\\_start \\<name\\> — Start an agent\n' +
        '/agent\\_stop \\<name\\> — Stop an agent\n' +
        '/agent\\_status \\<name\\> — Agent status \\& decisions\n' +
        '/agent\\_delete \\<name\\> — Delete an agent\n\n' +
        '_Send any message for AI\\-powered analysis_',
      { parse_mode: 'MarkdownV2' },
    ),
  );

  // Core commands
  bot.command('scan', handleScan);
  bot.command('trends', handleTrends);
  bot.command('track', handleTrack);
  bot.command('ico', handleIco);
  bot.command('audit', handleAudit);

  // Quick commands
  bot.command('price', handlePrice);
  bot.command('predict', handlePredict);
  bot.command('wallet', handleWallet);

  // Agent commands
  bot.command('agent', handleAgentHelp);
  bot.command('agent_create', handleAgentCreate);
  bot.command('agent_list', handleAgentList);
  bot.command('agent_start', handleAgentStart);
  bot.command('agent_stop', handleAgentStop);
  bot.command('agent_status', handleAgentStatus);
  bot.command('agent_delete', handleAgentDelete);
}

// ---------------------------------------------------------------------------
// Core command handlers
// ---------------------------------------------------------------------------

async function handleScan(ctx: Context): Promise<void> {
  const args = ctx.message?.text?.split(' ').slice(1) ?? [];
  const project = args[0];

  if (!project) {
    await ctx.reply('Usage: /scan <project_address>', { parse_mode: undefined });
    return;
  }

  await ctx.reply('🔍 Scanning project...');

  try {
    const adapter = getAdapter('ethereum');
    await adapter.connect(undefined, getConfig().etherscanApiKey);
    const analysis = await analyzeProject(project, adapter);
    const risk = assessRisk(analysis);
    await adapter.disconnect();

    const riskEmoji =
      risk.level === 'low'
        ? '🟢'
        : risk.level === 'medium'
          ? '🟡'
          : risk.level === 'high'
            ? '🟠'
            : '🔴';

    let message = `*Project Analysis*\n\n`;
    message += `${riskEmoji} Risk: ${risk.score}/100 \\(${escapeMarkdown(risk.level.toUpperCase())}\\)\n`;
    message += `${escapeMarkdown(risk.summary)}\n`;

    if (analysis.token) {
      message += `\nToken: ${escapeMarkdown(analysis.token.name)} \\(${escapeMarkdown(analysis.token.symbol)}\\)`;
    }

    if (risk.factors.length > 0) {
      message += '\n\n*Risk Factors*\n';
      for (const factor of risk.factors) {
        message += `• ${escapeMarkdown(factor)}\n`;
      }
    }

    message += '\n_Not financial advice\\. DYOR\\._';

    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await ctx.reply(`Error: ${msg}`);
  }
}

async function handleTrends(ctx: Context): Promise<void> {
  await ctx.reply('📊 Fetching trends...');

  try {
    const trending = await fetchTrendingTokens();
    if (trending.length === 0) {
      await ctx.reply('No trending data available right now.');
      return;
    }

    const formatted = formatTrending(
      trending.slice(0, 10).map((t) => ({
        name: t.name,
        symbol: t.symbol,
        chain: t.chain,
        priceUsd: t.priceUsd,
        priceChange24h: t.priceChange24h,
        volume24h: t.volume24h,
        source: t.source,
      })),
    );

    await ctx.reply(formatted + '\n\n_Live data from DexScreener \\& CoinGecko_', {
      parse_mode: 'MarkdownV2',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await ctx.reply(`Failed to fetch trends: ${msg}`);
  }
}

async function handleTrack(ctx: Context): Promise<void> {
  const args = ctx.message?.text?.split(' ').slice(1) ?? [];
  const wallet = args[0];

  if (!wallet) {
    await ctx.reply('Usage: /track <wallet_address>', { parse_mode: undefined });
    return;
  }

  await ctx.reply('👛 Analyzing wallet...');

  try {
    const adapter = getAdapter('ethereum');
    await adapter.connect(undefined, getConfig().etherscanApiKey);
    const analysis = await analyzeWallet(wallet, adapter);
    await adapter.disconnect();

    const formatted = formatWalletAnalysis(
      analysis.address,
      analysis.chain,
      analysis.balance.toString(),
      analysis.transactionCount,
      analysis.riskLevel,
      analysis.patterns,
    );

    await ctx.reply(formatted, { parse_mode: 'MarkdownV2' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await ctx.reply(`Wallet analysis failed: ${msg}`);
  }
}

async function handleIco(ctx: Context): Promise<void> {
  await ctx.reply('🚀 Fetching ICOs and raises...');

  try {
    const [icosResult, raisesResult] = await Promise.allSettled([
      fetchUpcomingICOs(),
      fetchRecentRaises(30),
    ]);

    const icos = icosResult.status === 'fulfilled' ? icosResult.value : [];
    const raises = raisesResult.status === 'fulfilled' ? raisesResult.value : [];

    const items = [
      ...raises.slice(0, 10).map((r) => ({
        name: r.name,
        round: r.round,
        amount: r.amount,
        chains: r.chains,
        leadInvestors: r.leadInvestors,
        date: new Date(r.date * 1000).toISOString().split('T')[0] ?? '',
      })),
    ];

    // Add ICO items that aren't already in raises
    const raiseNames = new Set(items.map((i) => i.name.toLowerCase()));
    for (const ico of icos.slice(0, 5)) {
      if (!raiseNames.has(ico.name.toLowerCase())) {
        items.push({
          name: ico.name,
          round: ico.status,
          amount: null,
          chains: [ico.chain ?? 'multi-chain'],
          leadInvestors: [],
          date: ico.startDate ?? '',
        });
      }
    }

    if (items.length === 0) {
      await ctx.reply('No ICO or fundraising data available right now.');
      return;
    }

    const formatted = formatICOs(items);
    await ctx.reply(formatted + '\n_Data from DeFiLlama \\& Pump\\.fun_', {
      parse_mode: 'MarkdownV2',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await ctx.reply(`Failed to fetch ICOs: ${msg}`);
  }
}

async function handleAudit(ctx: Context): Promise<void> {
  const args = ctx.message?.text?.split(' ').slice(1) ?? [];
  const contract = args[0];

  if (!contract) {
    await ctx.reply('Usage: /audit <contract_address>', { parse_mode: undefined });
    return;
  }

  await ctx.reply('🔍 Auditing contract...');

  try {
    const adapter = getAdapter('ethereum');
    await adapter.connect(undefined, getConfig().etherscanApiKey);
    const result = await auditContract(contract, adapter);
    await adapter.disconnect();

    const formatted = formatAudit(
      contract,
      result.overallRisk,
      result.findings.map((f) => ({
        severity: f.severity,
        title: f.title,
        description: f.description,
      })),
    );

    await ctx.reply(formatted, { parse_mode: 'MarkdownV2' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await ctx.reply(`Audit failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Quick command handlers
// ---------------------------------------------------------------------------

async function handlePrice(ctx: Context): Promise<void> {
  const args = ctx.message?.text?.split(' ').slice(1) ?? [];
  const symbol = args[0]?.toUpperCase();

  if (!symbol) {
    await ctx.reply('Usage: /price <symbol>\nExample: /price BTC');
    return;
  }

  try {
    const ticker = await fetchTickerPrice(symbol);
    const changeEmoji = ticker.change24h >= 0 ? '🟢' : '🔴';
    const changeSign = ticker.change24h >= 0 ? '+' : '';

    await ctx.reply(
      `💰 ${ticker.symbol}\n` +
        `Price: $${ticker.price.toLocaleString()}\n` +
        `${changeEmoji} 24h: ${changeSign}${ticker.change24h.toFixed(2)}%\n\n` +
        `Live from Binance`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await ctx.reply(`Price check failed: ${msg}`);
  }
}

async function handlePredict(ctx: Context): Promise<void> {
  const args = ctx.message?.text?.split(' ').slice(1) ?? [];
  const symbol = args[0]?.toUpperCase();

  if (!symbol) {
    await ctx.reply('Usage: /predict <symbol>\nExample: /predict ETH');
    return;
  }

  await ctx.reply(`🔮 Generating prediction for ${symbol}...`);

  try {
    const prediction = await generatePrediction(symbol);
    const dirEmoji =
      prediction.direction === 'up' ? '🟢' : prediction.direction === 'down' ? '🔴' : '⚪';

    let msg = `🔮 ${prediction.symbol} Prediction\n\n`;
    msg += `${dirEmoji} Direction: ${prediction.direction.toUpperCase()}\n`;
    msg += `📊 Confidence: ${prediction.confidence}%\n`;
    msg += `📈 Composite: ${prediction.composite.toFixed(2)}\n`;
    msg += `⏱ Timeframe: ${prediction.timeframe}\n\n`;

    msg += `Signals:\n`;
    msg += `• Technical: ${prediction.signals.technical}\n`;
    msg += `• Sentiment: ${prediction.signals.sentiment}\n`;
    msg += `• Derivatives: ${prediction.signals.derivatives}\n`;
    msg += `• Trend: ${prediction.signals.trend}\n`;
    msg += `• Macro: ${prediction.signals.macro}\n\n`;

    if (prediction.reasoning.length > 0) {
      msg += prediction.reasoning.join('\n') + '\n\n';
    }

    msg += prediction.disclaimer;

    await ctx.reply(msg);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await ctx.reply(`Prediction failed: ${msg}`);
  }
}

async function handleWallet(ctx: Context): Promise<void> {
  const args = ctx.message?.text?.split(' ').slice(1) ?? [];
  const address = args[0];

  if (!address) {
    await ctx.reply('Usage: /wallet <ethereum_address>\nExample: /wallet 0x...');
    return;
  }

  if (!isValidAddress(address)) {
    await ctx.reply('Invalid Ethereum address. Must start with 0x followed by 40 hex characters.');
    return;
  }

  try {
    const balance = await getWalletBalance(address);
    await ctx.reply(
      `👛 Wallet Balance\n\n` +
        `Address: ${address}\n` +
        `Balance: ${balance} ETH\n\n` +
        `Use /track <address> for full forensic analysis`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await ctx.reply(`Wallet query failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Agent command handlers
// ---------------------------------------------------------------------------

async function handleAgentHelp(ctx: Context): Promise<void> {
  const strategies = listStrategies();
  await ctx.reply(
    `🤖 Agent Management\n\n` +
      `Commands:\n` +
      `/agent_create <name> <strategy> <pairs> - Create agent\n` +
      `/agent_list - List all agents\n` +
      `/agent_start <name> - Start an agent\n` +
      `/agent_stop <name> - Stop an agent\n` +
      `/agent_status <name> - View status & decisions\n` +
      `/agent_delete <name> - Delete an agent\n\n` +
      `Available strategies: ${strategies.join(', ')}\n\n` +
      `Example:\n` +
      `/agent_create mybot momentum BTC,ETH`,
  );
}

async function handleAgentCreate(ctx: Context): Promise<void> {
  const args = ctx.message?.text?.split(' ').slice(1) ?? [];
  const name = args[0];
  const strategy = args[1] ?? 'momentum';
  const pairsStr = args[2] ?? 'BTC,ETH';

  if (!name) {
    await ctx.reply(
      'Usage: /agent_create <name> <strategy> <pairs>\n' +
        'Example: /agent_create mybot momentum BTC,ETH,SOL',
    );
    return;
  }

  try {
    const pairs = pairsStr.split(',').map((p) => p.trim().toUpperCase());
    const agent = createAgent(name, strategy, pairs);

    await ctx.reply(
      `✅ Agent Created\n\n` +
        `Name: ${agent.name}\n` +
        `Strategy: ${agent.strategy}\n` +
        `Pairs: ${agent.pairs.join(', ')}\n` +
        `Interval: ${agent.interval}s\n\n` +
        `Use /agent_start ${agent.name} to activate`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await ctx.reply(`Failed to create agent: ${msg}`);
  }
}

async function handleAgentList(ctx: Context): Promise<void> {
  const agents = listAgents();

  if (agents.length === 0) {
    await ctx.reply('No agents created yet. Use /agent_create to create one.');
    return;
  }

  let msg = '🤖 Your Agents\n\n';
  for (const agent of agents) {
    const state = getAgentStatus(agent.id);
    const statusEmoji =
      state?.status === 'running' ? '🟢' : state?.status === 'stopped' ? '🔴' : '⚪';
    msg += `${statusEmoji} ${agent.name} [${state?.status ?? 'idle'}]\n`;
    msg += `  Strategy: ${agent.strategy} | Pairs: ${agent.pairs.join(', ')}\n`;
    msg += `  Cycles: ${state?.cycleCount ?? 0} | Interval: ${agent.interval}s\n\n`;
  }

  await ctx.reply(msg);
}

async function handleAgentStart(ctx: Context): Promise<void> {
  const args = ctx.message?.text?.split(' ').slice(1) ?? [];
  const name = args[0];

  if (!name) {
    await ctx.reply('Usage: /agent_start <name>');
    return;
  }

  try {
    const agent = getAgentByName(name);
    if (!agent) {
      await ctx.reply(`Agent "${name}" not found. Use /agent_list to see your agents.`);
      return;
    }
    const state = startAgent(agent.id);
    await ctx.reply(
      `🟢 Agent "${state.config.name}" started. Monitoring ${state.config.pairs.join(', ')}.`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await ctx.reply(`Failed to start agent: ${msg}`);
  }
}

async function handleAgentStop(ctx: Context): Promise<void> {
  const args = ctx.message?.text?.split(' ').slice(1) ?? [];
  const name = args[0];

  if (!name) {
    await ctx.reply('Usage: /agent_stop <name>');
    return;
  }

  try {
    const agent = getAgentByName(name);
    if (!agent) {
      await ctx.reply(`Agent "${name}" not found.`);
      return;
    }
    const state = stopAgent(agent.id);
    await ctx.reply(`🔴 Agent "${state.config.name}" stopped after ${state.cycleCount} cycles.`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await ctx.reply(`Failed to stop agent: ${msg}`);
  }
}

async function handleAgentStatus(ctx: Context): Promise<void> {
  const args = ctx.message?.text?.split(' ').slice(1) ?? [];
  const name = args[0];

  if (!name) {
    await ctx.reply('Usage: /agent_status <name>');
    return;
  }

  const agent = getAgentByName(name);
  if (!agent) {
    await ctx.reply(`Agent "${name}" not found.`);
    return;
  }

  const state = getAgentStatus(agent.id);
  if (!state) {
    await ctx.reply(`Agent "${name}" not found.`);
    return;
  }

  const statusEmoji = state.status === 'running' ? '🟢' : state.status === 'stopped' ? '🔴' : '⚪';

  let msg = `🤖 Agent: ${state.config.name}\n\n`;
  msg += `${statusEmoji} Status: ${state.status}\n`;
  msg += `Strategy: ${state.config.strategy}\n`;
  msg += `Pairs: ${state.config.pairs.join(', ')}\n`;
  msg += `Interval: ${state.config.interval}s\n`;
  msg += `Cycles: ${state.cycleCount}\n`;
  if (state.error) msg += `Error: ${state.error}\n`;

  const decisions = getRecentDecisions(agent.id, 5);
  if (decisions.length > 0) {
    msg += '\nRecent Decisions:\n';
    for (const d of decisions) {
      const actionEmoji =
        d.decision.action === 'buy' ? '🟢' : d.decision.action === 'sell' ? '🔴' : '⚪';
      const time = new Date(d.timestamp).toLocaleString();
      msg += `${actionEmoji} ${d.symbol} ${d.decision.action.toUpperCase()} (${d.decision.confidence}%) — ${time}\n`;
      if (d.decision.reasoning.length > 0) {
        msg += `  → ${d.decision.reasoning[0]}\n`;
      }
    }
  }

  await ctx.reply(msg);
}

async function handleAgentDelete(ctx: Context): Promise<void> {
  const args = ctx.message?.text?.split(' ').slice(1) ?? [];
  const name = args[0];

  if (!name) {
    await ctx.reply('Usage: /agent_delete <name>');
    return;
  }

  try {
    const agent = getAgentByName(name);
    if (!agent) {
      await ctx.reply(`Agent "${name}" not found.`);
      return;
    }
    deleteAgent(agent.id);
    await ctx.reply(`🗑 Agent "${name}" deleted.`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await ctx.reply(`Failed to delete agent: ${msg}`);
  }
}
