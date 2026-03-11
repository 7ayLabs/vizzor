import type { Bot, Context } from 'grammy';
import { getAdapter } from '../../chains/registry.js';
import { analyzeProject } from '../../core/scanner/project-analyzer.js';
import { assessRisk } from '../../core/scanner/risk-scorer.js';

export function registerCommands(bot: Bot): void {
  bot.command('start', (ctx) =>
    ctx.reply(
      'Welcome to Vizzor \\- AI\\-powered crypto chronovisor\\.\n\n' +
        'Commands:\n' +
        '/scan <project> \\- Analyze a project\n' +
        '/trends \\- Market trends\n' +
        '/track <wallet> \\- Wallet analysis\n' +
        '/ico \\- Upcoming ICOs\n' +
        '/audit <contract> \\- Contract audit',
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
    await ctx.reply('Usage: /scan <project_address>');
    return;
  }

  await ctx.reply('Scanning project...');

  try {
    const adapter = getAdapter('ethereum');
    await adapter.connect();
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
  await ctx.reply('Market trends coming soon. Use the CLI for full access: `vizzor trends`');
}

async function handleTrack(ctx: Context): Promise<void> {
  const args = ctx.message?.text?.split(' ').slice(1) ?? [];
  if (!args[0]) {
    await ctx.reply('Usage: /track <wallet_address>');
    return;
  }
  await ctx.reply('Wallet tracking coming soon. Use the CLI: `vizzor track <wallet>`');
}

async function handleIco(ctx: Context): Promise<void> {
  await ctx.reply('ICO tracker coming soon. Use the CLI: `vizzor ico list`');
}

async function handleAudit(ctx: Context): Promise<void> {
  const args = ctx.message?.text?.split(' ').slice(1) ?? [];
  if (!args[0]) {
    await ctx.reply('Usage: /audit <contract_address>');
    return;
  }
  await ctx.reply('Contract audit coming soon. Use the CLI: `vizzor audit <contract>`');
}

function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}
