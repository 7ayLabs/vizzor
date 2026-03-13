// ---------------------------------------------------------------------------
// Telegram MarkdownV2 formatters for market data
// ---------------------------------------------------------------------------

export function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

export function formatPrice(price: number): string {
  return escapeMarkdown(price < 1 ? price.toPrecision(4) : price.toLocaleString());
}

export function formatChange(change: number): string {
  const sign = change > 0 ? '\\+' : '';
  const emoji = change > 0 ? '🟢' : change < 0 ? '🔴' : '⚪';
  return `${emoji} ${sign}${escapeMarkdown(change.toFixed(2))}%`;
}

export function formatVolume(volume: number): string {
  if (volume >= 1e9) return escapeMarkdown(`$${(volume / 1e9).toFixed(2)}B`);
  if (volume >= 1e6) return escapeMarkdown(`$${(volume / 1e6).toFixed(2)}M`);
  if (volume >= 1e3) return escapeMarkdown(`$${(volume / 1e3).toFixed(1)}K`);
  return escapeMarkdown(`$${volume.toFixed(0)}`);
}

export interface TrendingItem {
  name: string;
  symbol: string;
  chain: string;
  priceUsd: string;
  priceChange24h: number;
  volume24h: number;
  source: string;
}

export function formatTrending(items: TrendingItem[]): string {
  const lines = ['*🔥 Trending Tokens*', ''];
  for (const t of items.slice(0, 10)) {
    lines.push(
      `• *${escapeMarkdown(t.symbol)}* \\(${escapeMarkdown(t.chain)}\\)`,
      `  💲${escapeMarkdown(t.priceUsd)} ${formatChange(t.priceChange24h)}`,
      `  Vol: ${formatVolume(t.volume24h)} _\\[${escapeMarkdown(t.source)}\\]_`,
      '',
    );
  }
  return lines.join('\n');
}

export interface GainerLoser {
  symbol: string;
  price: number;
  change24h: number;
  volume: number;
}

export function formatGainersLosers(gainers: GainerLoser[], losers: GainerLoser[]): string {
  const lines = ['*📊 Market Movers*', ''];

  lines.push('*Top Gainers*');
  for (const g of gainers.slice(0, 5)) {
    lines.push(
      `  🟢 *${escapeMarkdown(g.symbol)}* $${formatPrice(g.price)} ${formatChange(g.change24h)}`,
    );
  }

  lines.push('', '*Top Losers*');
  for (const l of losers.slice(0, 5)) {
    lines.push(
      `  🔴 *${escapeMarkdown(l.symbol)}* $${formatPrice(l.price)} ${formatChange(l.change24h)}`,
    );
  }

  return lines.join('\n');
}

export interface ICOItem {
  name: string;
  round: string;
  amount: number | null;
  chains: string[];
  leadInvestors: string[];
  date: string;
}

export function formatICOs(icos: ICOItem[]): string {
  const lines = ['*🚀 Upcoming ICOs & Raises*', ''];
  for (const ico of icos.slice(0, 10)) {
    const amount = ico.amount
      ? escapeMarkdown(`$${(ico.amount / 1e6).toFixed(1)}M`)
      : 'undisclosed';
    const chains = ico.chains.length > 0 ? escapeMarkdown(ico.chains.join(', ')) : 'multi\\-chain';
    lines.push(
      `• *${escapeMarkdown(ico.name)}* — ${escapeMarkdown(ico.round)} \\(${amount}\\)`,
      `  ${chains} \\| ${escapeMarkdown(ico.date)}`,
    );
    if (ico.leadInvestors.length > 0) {
      lines.push(`  Led by: ${escapeMarkdown(ico.leadInvestors.join(', '))}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export interface AuditFinding {
  severity: string;
  title: string;
  description: string;
}

export function formatAudit(
  contract: string,
  overallRisk: string,
  findings: AuditFinding[],
): string {
  const riskEmoji =
    overallRisk === 'low'
      ? '🟢'
      : overallRisk === 'medium'
        ? '🟡'
        : overallRisk === 'high'
          ? '🟠'
          : '🔴';

  const lines = [
    `*🔍 Contract Audit*`,
    `Address: \`${escapeMarkdown(contract)}\``,
    `${riskEmoji} Risk: *${escapeMarkdown(overallRisk.toUpperCase())}*`,
    '',
  ];

  if (findings.length > 0) {
    lines.push('*Findings:*');
    for (const f of findings) {
      const sevEmoji =
        f.severity === 'critical'
          ? '🔴'
          : f.severity === 'high'
            ? '🟠'
            : f.severity === 'medium'
              ? '🟡'
              : '🟢';
      lines.push(`${sevEmoji} *${escapeMarkdown(f.title)}*: ${escapeMarkdown(f.description)}`);
    }
  } else {
    lines.push('✅ No significant findings\\.');
  }

  lines.push('', '_Not financial advice\\. DYOR\\._');
  return lines.join('\n');
}

export function formatWalletAnalysis(
  address: string,
  chain: string,
  balance: string,
  txCount: number,
  riskLevel: string,
  patterns: { severity: string; description: string }[],
): string {
  const riskEmoji =
    riskLevel === 'low' ? '🟢' : riskLevel === 'medium' ? '🟡' : riskLevel === 'high' ? '🟠' : '🔴';

  const lines = [
    `*👛 Wallet Analysis*`,
    `Address: \`${escapeMarkdown(address)}\``,
    `Chain: ${escapeMarkdown(chain)}`,
    `Balance: ${escapeMarkdown(balance)} ETH`,
    `Transactions: ${escapeMarkdown(String(txCount))}`,
    `${riskEmoji} Risk: *${escapeMarkdown(riskLevel.toUpperCase())}*`,
    '',
  ];

  if (patterns.length > 0) {
    lines.push('*Patterns:*');
    for (const p of patterns) {
      lines.push(`• \\[${escapeMarkdown(p.severity)}\\] ${escapeMarkdown(p.description)}`);
    }
  } else {
    lines.push('No unusual patterns detected\\.');
  }

  return lines.join('\n');
}
