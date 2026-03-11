// ---------------------------------------------------------------------------
// CLI response adapter — renders VizzorResponse for the terminal
// ---------------------------------------------------------------------------

import chalk from 'chalk';
import Table from 'cli-table3';
import type { ResponseAdapter, ResponseSection, VizzorResponse } from './types.js';

// ---------------------------------------------------------------------------
// Risk-score colour helpers
// ---------------------------------------------------------------------------

function riskColor(score: number): typeof chalk {
  if (score <= 30) return chalk.green;
  if (score <= 60) return chalk.yellow;
  return chalk.red;
}

function riskLabel(score: number): string {
  if (score <= 30) return 'LOW RISK';
  if (score <= 60) return 'MODERATE RISK';
  return 'HIGH RISK';
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderText(section: ResponseSection): string {
  return `${chalk.bold.cyan(section.heading)}\n${section.content}`;
}

function renderTable(section: ResponseSection): string {
  const heading = chalk.bold.cyan(section.heading);

  if (!section.data) {
    return `${heading}\n${section.content}`;
  }

  const table = new Table({
    head: section.data.headers.map((h) => chalk.bold.white(h)),
    style: { head: [], border: ['gray'] },
  });

  for (const row of section.data.rows) {
    table.push(row);
  }

  return `${heading}\n${table.toString()}`;
}

function renderList(section: ResponseSection): string {
  const heading = chalk.bold.cyan(section.heading);
  const items = section.content
    .split('\n')
    .filter(Boolean)
    .map((item) => `  ${chalk.dim('•')} ${item}`)
    .join('\n');
  return `${heading}\n${items}`;
}

function renderCode(section: ResponseSection): string {
  const heading = chalk.bold.cyan(section.heading);
  return `${heading}\n${chalk.gray('```')}\n${section.content}\n${chalk.gray('```')}`;
}

function renderWarning(section: ResponseSection): string {
  return `${chalk.bold.yellow('⚠  ' + section.heading)}\n${chalk.yellow(section.content)}`;
}

function renderSuccess(section: ResponseSection): string {
  return `${chalk.bold.green('✓  ' + section.heading)}\n${chalk.green(section.content)}`;
}

function renderError(section: ResponseSection): string {
  return `${chalk.bold.red('✗  ' + section.heading)}\n${chalk.red(section.content)}`;
}

const sectionRenderers: Record<ResponseSection['type'], (section: ResponseSection) => string> = {
  text: renderText,
  table: renderTable,
  list: renderList,
  code: renderCode,
  warning: renderWarning,
  success: renderSuccess,
  error: renderError,
};

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class CLIAdapter implements ResponseAdapter {
  render(response: VizzorResponse): string {
    const parts: string[] = [];

    // Title bar
    parts.push(chalk.bold.underline(response.title));

    // Risk score badge (if present)
    if (response.riskScore !== undefined) {
      const color = riskColor(response.riskScore);
      const label = riskLabel(response.riskScore);
      parts.push(color(`Risk Score: ${response.riskScore}/100 — ${label}`));
    }

    // Sections
    for (const section of response.sections) {
      const renderer = sectionRenderers[section.type];
      parts.push(renderer(section));
    }

    return parts.join('\n\n');
  }
}
