import React from 'react';
import { Box, Text } from 'ink';

interface CommandHintsProps {
  filter: string;
}

const COMMANDS = [
  { name: 'scan', args: '<address> [--chain]', desc: 'Scan token risk' },
  { name: 'track', args: '<wallet> [--chain]', desc: 'Analyze wallet' },
  { name: 'trends', args: '', desc: 'Market trends' },
  { name: 'audit', args: '<contract> [--chain]', desc: 'Audit contract' },
  { name: 'chain', args: '[chainId]', desc: 'Switch or list chains' },
  { name: 'add', args: '<symbol>', desc: 'Add crypto to ticker' },
  { name: 'remove', args: '<symbol>', desc: 'Remove from ticker' },
  { name: 'provider', args: '[list|<name>]', desc: 'Switch AI provider' },
  { name: 'config', args: '[set <key> <value>]', desc: 'Show/set config' },
  { name: 'clear', args: '', desc: 'Clear messages' },
  { name: 'help', args: '', desc: 'Show help' },
  { name: 'exit', args: '', desc: 'Exit Vizzor' },
];

export function CommandHints({ filter }: CommandHintsProps): React.JSX.Element | null {
  const query = filter.startsWith('/') ? filter.slice(1).toLowerCase() : '';
  const matches = query.length === 0 ? COMMANDS : COMMANDS.filter((c) => c.name.startsWith(query));

  if (matches.length === 0) return null;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      {matches.slice(0, 6).map((cmd) => (
        <Box key={cmd.name} gap={1}>
          <Text color="cyan" bold>
            /{cmd.name}
          </Text>
          {cmd.args ? <Text dimColor>{cmd.args}</Text> : null}
          <Text dimColor>
            {'— '}
            {cmd.desc}
          </Text>
        </Box>
      ))}
      {matches.length > 6 && <Text dimColor>...{matches.length - 6} more</Text>}
    </Box>
  );
}
