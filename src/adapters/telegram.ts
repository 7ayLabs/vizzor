// ---------------------------------------------------------------------------
// Telegram response adapter — renders VizzorResponse as MarkdownV2
// ---------------------------------------------------------------------------

import type { ResponseAdapter, ResponseSection, VizzorResponse } from './types.js';

// ---------------------------------------------------------------------------
// MarkdownV2 escaping
// ---------------------------------------------------------------------------

/**
 * Characters that must be escaped in Telegram MarkdownV2 outside of
 * pre-formatted and inline code blocks.
 *
 * @see https://core.telegram.org/bots/api#markdownv2-style
 */
const ESCAPE_RE = /([_*[\]()~`>#+\-=|{}.!\\])/g;

function escapeMarkdownV2(text: string): string {
  return text.replace(ESCAPE_RE, '\\$1');
}

// ---------------------------------------------------------------------------
// Risk-score emoji helpers
// ---------------------------------------------------------------------------

function riskEmoji(score: number): string {
  if (score <= 30) return '\u{1F7E2}'; // green circle
  if (score <= 60) return '\u{1F7E1}'; // yellow circle
  return '\u{1F534}'; // red circle
}

function riskLabel(score: number): string {
  if (score <= 30) return 'LOW RISK';
  if (score <= 60) return 'MODERATE RISK';
  return 'HIGH RISK';
}

// ---------------------------------------------------------------------------
// Section formatters
// ---------------------------------------------------------------------------

function formatTable(section: ResponseSection): string {
  const heading = `*${escapeMarkdownV2(section.heading)}*`;

  if (!section.data) {
    return `${heading}\n${escapeMarkdownV2(section.content)}`;
  }

  const { headers, rows } = section.data;
  const headerLine = headers.join(' | ');
  const separator = headers.map(() => '---').join(' | ');
  const rowLines = rows.map((r) => r.join(' | '));
  const tableBlock = [headerLine, separator, ...rowLines].join('\n');

  // Pre-formatted blocks don't need escaping in MarkdownV2.
  return `${heading}\n\`\`\`\n${tableBlock}\n\`\`\``;
}

function formatSection(section: ResponseSection): string {
  const heading = `*${escapeMarkdownV2(section.heading)}*`;

  switch (section.type) {
    case 'table':
      return formatTable(section);
    case 'list': {
      const items = section.content
        .split('\n')
        .filter(Boolean)
        .map((item) => `  \\- ${escapeMarkdownV2(item)}`)
        .join('\n');
      return `${heading}\n${items}`;
    }
    case 'code':
      return `${heading}\n\`\`\`\n${section.content}\n\`\`\``;
    case 'warning':
      return `\u26A0\uFE0F ${heading}\n${escapeMarkdownV2(section.content)}`;
    case 'success':
      return `\u2705 ${heading}\n${escapeMarkdownV2(section.content)}`;
    case 'error':
      return `\u274C ${heading}\n${escapeMarkdownV2(section.content)}`;
    case 'text':
    default:
      return `${heading}\n${escapeMarkdownV2(section.content)}`;
  }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class TelegramAdapter implements ResponseAdapter {
  /**
   * Render a {@link VizzorResponse} as a Telegram MarkdownV2 string.
   */
  render(response: VizzorResponse): string {
    const parts: string[] = [];

    // Title
    parts.push(`*${escapeMarkdownV2(response.title)}*`);

    // Risk score
    if (response.riskScore !== undefined) {
      const emoji = riskEmoji(response.riskScore);
      const label = riskLabel(response.riskScore);
      parts.push(
        `${emoji} *Risk Score:* ${escapeMarkdownV2(String(response.riskScore))}/100 \\- ${escapeMarkdownV2(label)}`,
      );
    }

    // Sections
    for (const section of response.sections) {
      parts.push(formatSection(section));
    }

    // Footer
    parts.push(escapeMarkdownV2('— Powered by Vizzor (7ayLabs)'));

    return parts.join('\n\n');
  }
}
