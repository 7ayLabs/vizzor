import Table from 'cli-table3';

/**
 * Creates a cli-table3 instance with the given column headers and
 * standard styling.
 */
export function createTable(headers: string[]): Table.Table {
  return new Table({
    head: headers,
    style: {
      head: ['cyan'],
      border: ['gray'],
    },
  });
}

/**
 * Creates a table with the given headers and rows, then prints it to stdout.
 */
export function printTable(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): void {
  const table = createTable(headers);
  for (const row of rows) {
    table.push(row.map((cell) => (cell == null ? '' : String(cell))));
  }
  console.log(table.toString());
}
