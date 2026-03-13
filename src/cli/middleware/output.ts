import chalk from 'chalk';
import { createTable } from '../../utils/table.js';

export type OutputFormat = 'table' | 'json' | 'markdown';

/**
 * Formats and prints structured data based on the chosen output format.
 */
export function formatOutput(
  data: Record<string, unknown>,
  options: { format: OutputFormat; color?: boolean },
): void {
  switch (options.format) {
    case 'json':
      console.log(
        JSON.stringify(
          data,
          (_key, value) => (typeof value === 'bigint' ? value.toString() : (value as unknown)),
          2,
        ),
      );
      break;
    case 'markdown':
      printMarkdown(data);
      break;
    case 'table':
    default:
      printTableOutput(data, options.color ?? true);
      break;
  }
}

function printTableOutput(data: Record<string, unknown>, color: boolean): void {
  const entries = Object.entries(data);

  if (entries.length === 0) {
    console.log(color ? chalk.dim('No data') : 'No data');
    return;
  }

  // If the data contains an array, render it as a table
  const arrayEntry = entries.find(([, v]) => Array.isArray(v));
  if (arrayEntry) {
    const [key, arr] = arrayEntry as [string, Record<string, unknown>[]];
    if (arr.length > 0) {
      const headers = Object.keys(arr[0]);
      const table = createTable(headers);
      for (const row of arr) {
        table.push(headers.map((h) => String(row[h] ?? '')));
      }
      if (color) {
        console.log(chalk.bold(key));
      } else {
        console.log(key);
      }
      console.log(table.toString());
    }
    return;
  }

  // Otherwise render key-value pairs
  const table = createTable(['Key', 'Value']);
  for (const [key, value] of entries) {
    table.push([key, String(value ?? '')]);
  }
  console.log(table.toString());
}

function printMarkdown(data: Record<string, unknown>): void {
  const entries = Object.entries(data);

  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      console.log(`## ${key}\n`);
      if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
        const headers = Object.keys(value[0] as Record<string, unknown>);
        console.log(`| ${headers.join(' | ')} |`);
        console.log(`| ${headers.map(() => '---').join(' | ')} |`);
        for (const row of value as Record<string, unknown>[]) {
          console.log(`| ${headers.map((h) => String(row[h] ?? '')).join(' | ')} |`);
        }
      } else {
        for (const item of value) {
          console.log(`- ${String(item)}`);
        }
      }
      console.log();
    } else {
      console.log(`**${key}:** ${String(value ?? '')}`);
    }
  }
}
