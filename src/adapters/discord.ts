// ---------------------------------------------------------------------------
// Discord response adapter — renders VizzorResponse as Discord embeds
// ---------------------------------------------------------------------------

import { EmbedBuilder } from 'discord.js';
import type { ResponseAdapter, ResponseSection, VizzorResponse } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Discord embed description hard limit. */
const MAX_EMBED_LENGTH = 4096;

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

function riskColorHex(score: number): number {
  if (score <= 30) return 0x2ecc71; // green
  if (score <= 60) return 0xf1c40f; // yellow
  return 0xe74c3c; // red
}

// ---------------------------------------------------------------------------
// Section formatters (to Discord-flavoured Markdown)
// ---------------------------------------------------------------------------

function formatTable(section: ResponseSection): string {
  if (!section.data) return section.content;

  const { headers, rows } = section.data;
  const headerLine = headers.join(' | ');
  const separator = headers.map(() => '---').join(' | ');
  const rowLines = rows.map((r) => r.join(' | '));

  return `\`\`\`\n${headerLine}\n${separator}\n${rowLines.join('\n')}\n\`\`\``;
}

function formatSection(section: ResponseSection): string {
  const heading = `**${section.heading}**`;

  switch (section.type) {
    case 'table':
      return `${heading}\n${formatTable(section)}`;
    case 'list': {
      const items = section.content
        .split('\n')
        .filter(Boolean)
        .map((item) => `• ${item}`)
        .join('\n');
      return `${heading}\n${items}`;
    }
    case 'code':
      return `${heading}\n\`\`\`\n${section.content}\n\`\`\``;
    case 'warning':
      return `⚠️ ${heading}\n${section.content}`;
    case 'success':
      return `✅ ${heading}\n${section.content}`;
    case 'error':
      return `❌ ${heading}\n${section.content}`;
    case 'text':
    default:
      return `${heading}\n${section.content}`;
  }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class DiscordAdapter implements ResponseAdapter {
  /**
   * Render a {@link VizzorResponse} as one or more Discord embeds.
   *
   * If the total content exceeds the embed description limit it will be split
   * across multiple embeds so that Discord does not reject the message.
   */
  render(response: VizzorResponse): EmbedBuilder | EmbedBuilder[] {
    const color = response.riskScore !== undefined ? riskColorHex(response.riskScore) : 0x5865f2;

    const sectionTexts = response.sections.map(formatSection);

    // Prepend risk score line if present.
    if (response.riskScore !== undefined) {
      const label = riskLabel(response.riskScore);
      sectionTexts.unshift(`**Risk Score:** ${response.riskScore}/100 — ${label}`);
    }

    // Try to fit everything in a single embed first.
    const fullBody = sectionTexts.join('\n\n');

    if (fullBody.length <= MAX_EMBED_LENGTH) {
      return new EmbedBuilder()
        .setTitle(truncate(response.title, 256))
        .setDescription(fullBody)
        .setColor(color)
        .setFooter({ text: 'Powered by Vizzor — 7ayLabs' });
    }

    // Split into multiple embeds if needed.
    return splitIntoEmbeds(response.title, sectionTexts, color);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function riskLabel(score: number): string {
  if (score <= 30) return 'LOW RISK';
  if (score <= 60) return 'MODERATE RISK';
  return 'HIGH RISK';
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '\u2026';
}

function splitIntoEmbeds(title: string, sectionTexts: string[], color: number): EmbedBuilder[] {
  const embeds: EmbedBuilder[] = [];
  let currentBody = '';

  for (const section of sectionTexts) {
    const addition = currentBody ? `\n\n${section}` : section;

    if (currentBody.length + addition.length > MAX_EMBED_LENGTH) {
      // Flush the current embed.
      const embed = new EmbedBuilder().setColor(color).setDescription(currentBody);

      if (embeds.length === 0) {
        embed.setTitle(truncate(title, 256));
      }

      embeds.push(embed);
      currentBody = section;
    } else {
      currentBody += addition;
    }
  }

  // Flush remaining content.
  if (currentBody) {
    const embed = new EmbedBuilder()
      .setColor(color)
      .setDescription(currentBody)
      .setFooter({ text: 'Powered by Vizzor — 7ayLabs' });

    if (embeds.length === 0) {
      embed.setTitle(truncate(title, 256));
    }

    embeds.push(embed);
  }

  return embeds;
}
