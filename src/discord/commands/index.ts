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
import { checkRateLimit } from '../middleware/rate-limit.js';

export function registerSlashCommands(): object[] {
  return [
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
// Command handlers
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

  const wallet = interaction.options.getString('wallet', true);
  const chain = interaction.options.getString('chain') ?? 'ethereum';

  const adapter = getAdapter(chain);
  await adapter.connect(undefined, getConfig().etherscanApiKey);
  const analysis = await analyzeWallet(wallet, adapter);
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
      { name: 'Address', value: `\`${wallet}\``, inline: false },
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
          '`/scan <address>` — Analyze token/project risk\n' +
            '`/trends` — Trending tokens + market data\n' +
            '`/track <wallet>` — Wallet forensics\n' +
            '`/ico` — Upcoming ICOs & fundraising rounds\n' +
            '`/audit <contract>` — Smart contract audit\n' +
            '`/help` — Show this message\n\n' +
            '_Mention the bot for AI chat guidance._',
        )
        .setFooter({ text: 'Vizzor by 7ayLabs' }),
    ],
    ephemeral: true,
  });
}
