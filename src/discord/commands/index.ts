import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getAdapter } from '../../chains/registry.js';
import { getConfig } from '../../config/loader.js';
import { analyzeProject } from '../../core/scanner/project-analyzer.js';
import { assessRisk } from '../../core/scanner/risk-scorer.js';

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
    new SlashCommandBuilder().setName('trends').setDescription('View market trends').toJSON(),
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
    new SlashCommandBuilder().setName('ico').setDescription('List upcoming ICOs/IDOs').toJSON(),
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
  ];
}

export async function handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const { commandName } = interaction;

  try {
    switch (commandName) {
      case 'scan':
        await handleScanCommand(interaction);
        break;
      default:
        await interaction.reply({
          content: `Command \`/${commandName}\` is coming soon.`,
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
