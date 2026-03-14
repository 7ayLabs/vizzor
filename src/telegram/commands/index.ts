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
        '/help — Show all commands',
      { parse_mode: 'MarkdownV2' },
    ),
  );

  bot.command('help', (ctx) =>
    ctx.reply(
      '*Vizzor Commands*\n\n' +
        '/scan \\<address\\> — Analyze token/project risk\n' +
        '/track \\<wallet\\> — Wallet analysis \\& forensics\n' +
        '/trends — Trending tokens from DexScreener\n' +
        '/ico — Upcoming ICOs \\& fundraising rounds\n' +
        '/audit \\<contract\\> — Smart contract audit\n' +
        '/start — Welcome message\n\n' +
        '_Send any message for AI\\-powered analysis_',
      { parse_mode: 'MarkdownV2' },
    ),
  );

  bot.command('scan', handleScan);
  bot.command('trends', handleTrends);
  bot.command('track', handleTrack);
  bot.command('ico', handleIco);
  bot.command('audit', handleAudit);
}

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
