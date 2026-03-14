import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
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
  getWalletBalance,
  isValidAddress,
} from '../../core/agent/index.js';
import { checkRateLimit } from '../middleware/rate-limit.js';

export function registerSlashCommands(): object[] {
  return [
    // Core commands
    new SlashCommandBuilder()
      .setName('scan')
      .setDescription('Analyze a crypto project')
      .addStringOption((opt) =>
        opt.setName('project').setDescription('Project name or contract address').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('chain').setDescription('Target chain').setRequired(false),
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('trends')
      .setDescription('Trending tokens + market data')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('track')
      .setDescription('Analyze a wallet')
      .addStringOption((opt) =>
        opt.setName('wallet').setDescription('Wallet address').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('chain').setDescription('Target chain').setRequired(false),
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('ico')
      .setDescription('Upcoming ICOs & fundraising rounds')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('audit')
      .setDescription('Audit a smart contract')
      .addStringOption((opt) =>
        opt.setName('contract').setDescription('Contract address').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('chain').setDescription('Target chain').setRequired(false),
      )
      .toJSON(),
    new SlashCommandBuilder().setName('help').setDescription('Show all Vizzor commands').toJSON(),

    // Quick commands
    new SlashCommandBuilder()
      .setName('price')
      .setDescription('Quick price check')
      .addStringOption((opt) =>
        opt.setName('symbol').setDescription('Token symbol (e.g. BTC, ETH)').setRequired(true),
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('predict')
      .setDescription('AI prediction with multi-signal analysis')
      .addStringOption((opt) =>
        opt.setName('symbol').setDescription('Token symbol (e.g. BTC, ETH)').setRequired(true),
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('wallet')
      .setDescription('Check wallet balance')
      .addStringOption((opt) =>
        opt.setName('address').setDescription('Ethereum address').setRequired(true),
      )
      .toJSON(),

    // Agent commands
    new SlashCommandBuilder()
      .setName('agent_create')
      .setDescription('Create a trading agent')
      .addStringOption((opt) => opt.setName('name').setDescription('Agent name').setRequired(true))
      .addStringOption((opt) =>
        opt
          .setName('strategy')
          .setDescription('Strategy (momentum, trend-following)')
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName('pairs')
          .setDescription('Comma-separated pairs (e.g. BTC,ETH,SOL)')
          .setRequired(false),
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('agent_list')
      .setDescription('List all trading agents')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('agent_start')
      .setDescription('Start a trading agent')
      .addStringOption((opt) => opt.setName('name').setDescription('Agent name').setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('agent_stop')
      .setDescription('Stop a trading agent')
      .addStringOption((opt) => opt.setName('name').setDescription('Agent name').setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('agent_status')
      .setDescription('View agent status & recent decisions')
      .addStringOption((opt) => opt.setName('name').setDescription('Agent name').setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('agent_delete')
      .setDescription('Delete a trading agent')
      .addStringOption((opt) => opt.setName('name').setDescription('Agent name').setRequired(true))
      .toJSON(),
  ];
}

export async function handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const { commandName } = interaction;

  // Rate limiting
  const { allowed } = checkRateLimit(interaction.user.id);
  if (!allowed) {
    await interaction.reply({
      content: 'Rate limited. Please wait a moment before sending more commands.',
      ephemeral: true,
    });
    return;
  }

  try {
    switch (commandName) {
      case 'scan':
        await handleScanCommand(interaction);
        break;
      case 'trends':
        await handleTrendsCommand(interaction);
        break;
      case 'track':
        await handleTrackCommand(interaction);
        break;
      case 'ico':
        await handleIcoCommand(interaction);
        break;
      case 'audit':
        await handleAuditCommand(interaction);
        break;
      case 'help':
        await handleHelpCommand(interaction);
        break;
      case 'price':
        await handlePriceCommand(interaction);
        break;
      case 'predict':
        await handlePredictCommand(interaction);
        break;
      case 'wallet':
        await handleWalletCommand(interaction);
        break;
      case 'agent_create':
        await handleAgentCreateCommand(interaction);
        break;
      case 'agent_list':
        await handleAgentListCommand(interaction);
        break;
      case 'agent_start':
        await handleAgentStartCommand(interaction);
        break;
      case 'agent_stop':
        await handleAgentStopCommand(interaction);
        break;
      case 'agent_status':
        await handleAgentStatusCommand(interaction);
        break;
      case 'agent_delete':
        await handleAgentDeleteCommand(interaction);
        break;
      default:
        await interaction.reply({
          content: `Unknown command: \`/${commandName}\`. Use \`/help\` for available commands.`,
          ephemeral: true,
        });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reply = { content: `Error: ${message}`, ephemeral: true };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
}

// ---------------------------------------------------------------------------
// Core command handlers
// ---------------------------------------------------------------------------

async function handleScanCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const project = interaction.options.getString('project', true);
  const chain = interaction.options.getString('chain') ?? 'ethereum';

  const adapter = getAdapter(chain);
  await adapter.connect(undefined, getConfig().etherscanApiKey);

  const analysis = await analyzeProject(project, adapter);
  const risk = assessRisk(analysis);
  await adapter.disconnect();

  const riskColor =
    risk.level === 'low'
      ? 0x00ff00
      : risk.level === 'medium'
        ? 0xffff00
        : risk.level === 'high'
          ? 0xff8800
          : 0xff0000;

  const embed = new EmbedBuilder()
    .setTitle(`Project Analysis: ${project}`)
    .setColor(riskColor)
    .addFields(
      { name: 'Chain', value: chain, inline: true },
      {
        name: 'Risk Score',
        value: `${risk.score}/100 (${risk.level.toUpperCase()})`,
        inline: true,
      },
      { name: 'Assessment', value: risk.summary },
    )
    .setFooter({ text: 'Vizzor by 7ayLabs — Not financial advice' })
    .setTimestamp();

  if (analysis.token) {
    embed.addFields({
      name: 'Token',
      value: `${analysis.token.name} (${analysis.token.symbol})`,
      inline: true,
    });
  }

  if (risk.factors.length > 0) {
    embed.addFields({
      name: 'Risk Factors',
      value: risk.factors.map((f) => `- ${f}`).join('\n'),
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleTrendsCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const trending = await fetchTrendingTokens();

  if (trending.length === 0) {
    await interaction.editReply('No trending data available right now.');
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('Trending Tokens')
    .setColor(0x5865f2)
    .setFooter({ text: 'Live data from DexScreener & CoinGecko' })
    .setTimestamp();

  for (const t of trending.slice(0, 10)) {
    const changeSign = t.priceChange24h >= 0 ? '+' : '';
    const vol =
      t.volume24h >= 1_000_000
        ? `$${(t.volume24h / 1_000_000).toFixed(1)}M`
        : `$${Math.round(t.volume24h).toLocaleString()}`;

    embed.addFields({
      name: `${t.symbol} (${t.chain})`,
      value: `Price: $${t.priceUsd}\n24h: ${changeSign}${t.priceChange24h.toFixed(1)}%\nVol: ${vol}\nSource: ${t.source}`,
      inline: true,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleTrackCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const walletAddr = interaction.options.getString('wallet', true);
  const chain = interaction.options.getString('chain') ?? 'ethereum';

  const adapter = getAdapter(chain);
  await adapter.connect(undefined, getConfig().etherscanApiKey);
  const analysis = await analyzeWallet(walletAddr, adapter);
  await adapter.disconnect();

  const riskColor =
    analysis.riskLevel === 'clean'
      ? 0x00ff00
      : analysis.riskLevel === 'suspicious'
        ? 0xffff00
        : 0xff0000;

  const embed = new EmbedBuilder()
    .setTitle(`Wallet Analysis`)
    .setColor(riskColor)
    .addFields(
      { name: 'Address', value: `\`${walletAddr}\``, inline: false },
      { name: 'Chain', value: chain, inline: true },
      { name: 'Balance', value: `${analysis.balance.toString()} wei`, inline: true },
      { name: 'Transactions', value: String(analysis.transactionCount), inline: true },
      { name: 'Risk Level', value: analysis.riskLevel.toUpperCase(), inline: true },
    )
    .setFooter({ text: 'Vizzor by 7ayLabs — Not financial advice' })
    .setTimestamp();

  if (analysis.patterns.length > 0) {
    const patternText = analysis.patterns
      .map((p) => `[${p.severity.toUpperCase()}] ${p.description}`)
      .join('\n');
    embed.addFields({ name: 'Patterns', value: patternText });
  } else {
    embed.addFields({ name: 'Patterns', value: 'No unusual patterns detected.' });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleIcoCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const [icosResult, raisesResult] = await Promise.allSettled([
    fetchUpcomingICOs(),
    fetchRecentRaises(30),
  ]);

  const icos = icosResult.status === 'fulfilled' ? icosResult.value : [];
  const raises = raisesResult.status === 'fulfilled' ? raisesResult.value : [];

  interface IcoItem {
    name: string;
    round: string;
    amount: number | null;
    chains: string[];
    leadInvestors: string[];
    date: string;
  }

  const items: IcoItem[] = raises.slice(0, 10).map((r) => ({
    name: r.name,
    round: r.round,
    amount: r.amount,
    chains: r.chains,
    leadInvestors: r.leadInvestors,
    date: new Date(r.date * 1000).toISOString().split('T')[0] ?? '',
  }));

  // Merge ICO items not already in raises
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
    await interaction.editReply('No ICO or fundraising data available right now.');
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('Upcoming ICOs & Fundraising Rounds')
    .setColor(0x5865f2)
    .setFooter({ text: 'Data from DeFiLlama & Pump.fun' })
    .setTimestamp();

  for (const item of items.slice(0, 10)) {
    const amount = item.amount ? `$${(item.amount / 1e6).toFixed(1)}M` : 'Undisclosed';
    const chains = item.chains.join(', ') || 'multi-chain';
    let value = `${item.round} (${amount})\n${chains} | ${item.date}`;
    if (item.leadInvestors.length > 0) {
      value += `\nLed by: ${item.leadInvestors.slice(0, 3).join(', ')}`;
    }
    embed.addFields({ name: item.name, value, inline: false });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleAuditCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const contract = interaction.options.getString('contract', true);
  const chain = interaction.options.getString('chain') ?? 'ethereum';

  const adapter = getAdapter(chain);
  await adapter.connect(undefined, getConfig().etherscanApiKey);
  const result = await auditContract(contract, adapter);
  await adapter.disconnect();

  const riskColor =
    result.overallRisk === 'low'
      ? 0x00ff00
      : result.overallRisk === 'medium'
        ? 0xffff00
        : result.overallRisk === 'high'
          ? 0xff8800
          : 0xff0000;

  const embed = new EmbedBuilder()
    .setTitle(`Contract Audit`)
    .setColor(riskColor)
    .addFields(
      { name: 'Address', value: `\`${contract}\``, inline: false },
      { name: 'Chain', value: chain, inline: true },
      { name: 'Risk Level', value: result.overallRisk.toUpperCase(), inline: true },
      { name: 'Has Code', value: result.hasCode ? 'Yes' : 'No', inline: true },
      { name: 'Code Size', value: `${result.codeSize} bytes`, inline: true },
    )
    .setFooter({ text: 'Vizzor by 7ayLabs — Not financial advice' })
    .setTimestamp();

  if (result.findings.length > 0) {
    const findingsText = result.findings
      .map((f) => `[${f.severity.toUpperCase()}] ${f.title}: ${f.description}`)
      .join('\n');
    embed.addFields({ name: 'Findings', value: findingsText.slice(0, 1024) });
  } else {
    embed.addFields({ name: 'Findings', value: 'No significant findings.' });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleHelpCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('Vizzor Commands')
        .setColor(0x5865f2)
        .setDescription(
          '**Analysis:**\n' +
            '`/scan <address>` — Analyze token/project risk\n' +
            '`/trends` — Trending tokens + market data\n' +
            '`/track <wallet>` — Wallet forensics\n' +
            '`/ico` — Upcoming ICOs & fundraising rounds\n' +
            '`/audit <contract>` — Smart contract audit\n\n' +
            '**Quick Commands:**\n' +
            '`/price <symbol>` — Live price check\n' +
            '`/predict <symbol>` — AI prediction with signals\n' +
            '`/wallet <address>` — ETH wallet balance\n\n' +
            '**Agent Management:**\n' +
            '`/agent_create <name>` — Create trading agent\n' +
            '`/agent_list` — List all agents\n' +
            '`/agent_start <name>` — Start an agent\n' +
            '`/agent_stop <name>` — Stop an agent\n' +
            '`/agent_status <name>` — Agent status & decisions\n' +
            '`/agent_delete <name>` — Delete an agent\n\n' +
            '_@mention the bot for AI-powered analysis._',
        )
        .setFooter({ text: 'Vizzor by 7ayLabs' }),
    ],
    ephemeral: true,
  });
}

// ---------------------------------------------------------------------------
// Quick command handlers
// ---------------------------------------------------------------------------

async function handlePriceCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const symbol = interaction.options.getString('symbol', true).toUpperCase();

  const ticker = await fetchTickerPrice(symbol);
  const changeEmoji = ticker.change24h >= 0 ? '🟢' : '🔴';
  const changeSign = ticker.change24h >= 0 ? '+' : '';

  const embed = new EmbedBuilder()
    .setTitle(`💰 ${ticker.symbol}`)
    .setColor(ticker.change24h >= 0 ? 0x00ff00 : 0xff0000)
    .addFields(
      { name: 'Price', value: `$${ticker.price.toLocaleString()}`, inline: true },
      {
        name: '24h Change',
        value: `${changeEmoji} ${changeSign}${ticker.change24h.toFixed(2)}%`,
        inline: true,
      },
    )
    .setFooter({ text: 'Live from Binance' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handlePredictCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const symbol = interaction.options.getString('symbol', true).toUpperCase();
  const prediction = await generatePrediction(symbol);

  const dirColor =
    prediction.direction === 'up'
      ? 0x00ff00
      : prediction.direction === 'down'
        ? 0xff0000
        : 0x808080;
  const dirEmoji =
    prediction.direction === 'up' ? '🟢' : prediction.direction === 'down' ? '🔴' : '⚪';

  const embed = new EmbedBuilder()
    .setTitle(`🔮 ${prediction.symbol} Prediction`)
    .setColor(dirColor)
    .addFields(
      {
        name: 'Direction',
        value: `${dirEmoji} ${prediction.direction.toUpperCase()}`,
        inline: true,
      },
      { name: 'Confidence', value: `${prediction.confidence}%`, inline: true },
      { name: 'Composite', value: prediction.composite.toFixed(2), inline: true },
      { name: 'Timeframe', value: prediction.timeframe, inline: true },
    )
    .setFooter({ text: 'Not financial advice — DYOR' })
    .setTimestamp();

  const signalLines = [
    `Technical: ${prediction.signals.technical}`,
    `Sentiment: ${prediction.signals.sentiment}`,
    `Derivatives: ${prediction.signals.derivatives}`,
    `Trend: ${prediction.signals.trend}`,
    `Macro: ${prediction.signals.macro}`,
  ];
  embed.addFields({
    name: 'Signals',
    value: signalLines.join('\n'),
  });

  if (prediction.reasoning.length > 0) {
    embed.addFields({
      name: 'Reasoning',
      value: prediction.reasoning.join('\n').slice(0, 1024),
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleWalletCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const address = interaction.options.getString('address', true);

  if (!isValidAddress(address)) {
    await interaction.editReply(
      'Invalid Ethereum address. Must start with 0x followed by 40 hex characters.',
    );
    return;
  }

  const balance = await getWalletBalance(address);

  const embed = new EmbedBuilder()
    .setTitle('👛 Wallet Balance')
    .setColor(0x5865f2)
    .addFields(
      { name: 'Address', value: `\`${address}\``, inline: false },
      { name: 'Balance', value: `${balance} ETH`, inline: true },
    )
    .setFooter({ text: 'Use /track for full forensic analysis' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ---------------------------------------------------------------------------
// Agent command handlers
// ---------------------------------------------------------------------------

async function handleAgentCreateCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const name = interaction.options.getString('name', true);
  const strategy = interaction.options.getString('strategy') ?? 'momentum';
  const pairsStr = interaction.options.getString('pairs') ?? 'BTC,ETH';
  const pairs = pairsStr.split(',').map((p) => p.trim().toUpperCase());

  const agent = createAgent(name, strategy, pairs);

  const embed = new EmbedBuilder()
    .setTitle('✅ Agent Created')
    .setColor(0x00ff00)
    .addFields(
      { name: 'Name', value: agent.name, inline: true },
      { name: 'Strategy', value: agent.strategy, inline: true },
      { name: 'Pairs', value: agent.pairs.join(', '), inline: true },
      { name: 'Interval', value: `${agent.interval}s`, inline: true },
    )
    .setFooter({ text: `Use /agent_start ${agent.name} to activate` });

  await interaction.editReply({ embeds: [embed] });
}

async function handleAgentListCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const agents = listAgents();

  if (agents.length === 0) {
    await interaction.editReply('No agents created yet. Use `/agent_create` to create one.');
    return;
  }

  const embed = new EmbedBuilder().setTitle('🤖 Your Agents').setColor(0x5865f2).setTimestamp();

  for (const agent of agents) {
    const state = getAgentStatus(agent.id);
    const statusEmoji =
      state?.status === 'running' ? '🟢' : state?.status === 'stopped' ? '🔴' : '⚪';
    embed.addFields({
      name: `${statusEmoji} ${agent.name} [${state?.status ?? 'idle'}]`,
      value: `Strategy: ${agent.strategy}\nPairs: ${agent.pairs.join(', ')}\nCycles: ${state?.cycleCount ?? 0} | Interval: ${agent.interval}s`,
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleAgentStartCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('name', true);

  const agent = getAgentByName(name);
  if (!agent) {
    await interaction.reply({
      content: `Agent "${name}" not found. Use \`/agent_list\` to see your agents.`,
      ephemeral: true,
    });
    return;
  }

  const state = startAgent(agent.id);
  await interaction.reply(
    `🟢 Agent "${state.config.name}" started. Monitoring ${state.config.pairs.join(', ')}.`,
  );
}

async function handleAgentStopCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('name', true);

  const agent = getAgentByName(name);
  if (!agent) {
    await interaction.reply({
      content: `Agent "${name}" not found.`,
      ephemeral: true,
    });
    return;
  }

  const state = stopAgent(agent.id);
  await interaction.reply(
    `🔴 Agent "${state.config.name}" stopped after ${state.cycleCount} cycles.`,
  );
}

async function handleAgentStatusCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const name = interaction.options.getString('name', true);

  const agent = getAgentByName(name);
  if (!agent) {
    await interaction.editReply(`Agent "${name}" not found.`);
    return;
  }

  const state = getAgentStatus(agent.id);
  if (!state) {
    await interaction.editReply(`Agent "${name}" not found.`);
    return;
  }

  const statusColor =
    state.status === 'running' ? 0x00ff00 : state.status === 'stopped' ? 0xff0000 : 0x808080;
  const statusEmoji = state.status === 'running' ? '🟢' : state.status === 'stopped' ? '🔴' : '⚪';

  const embed = new EmbedBuilder()
    .setTitle(`🤖 Agent: ${state.config.name}`)
    .setColor(statusColor)
    .addFields(
      { name: 'Status', value: `${statusEmoji} ${state.status}`, inline: true },
      { name: 'Strategy', value: state.config.strategy, inline: true },
      { name: 'Pairs', value: state.config.pairs.join(', '), inline: true },
      { name: 'Interval', value: `${state.config.interval}s`, inline: true },
      { name: 'Cycles', value: String(state.cycleCount), inline: true },
    )
    .setTimestamp();

  if (state.error) {
    embed.addFields({ name: 'Error', value: state.error });
  }

  const decisions = getRecentDecisions(agent.id, 5);
  if (decisions.length > 0) {
    const decisionText = decisions
      .map((d) => {
        const actionEmoji =
          d.decision.action === 'buy' ? '🟢' : d.decision.action === 'sell' ? '🔴' : '⚪';
        const time = new Date(d.timestamp).toLocaleString();
        return `${actionEmoji} ${d.symbol} ${d.decision.action.toUpperCase()} (${d.decision.confidence}%) — ${time}`;
      })
      .join('\n');
    embed.addFields({ name: 'Recent Decisions', value: decisionText.slice(0, 1024) });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleAgentDeleteCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('name', true);

  const agent = getAgentByName(name);
  if (!agent) {
    await interaction.reply({
      content: `Agent "${name}" not found.`,
      ephemeral: true,
    });
    return;
  }

  deleteAgent(agent.id);
  await interaction.reply(`🗑 Agent "${name}" deleted.`);
}
