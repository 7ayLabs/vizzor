import React from 'react';
import { Box, Text, Spacer } from 'ink';

interface StatusBarProps {
  provider: string;
  chain: string;
  connected: boolean;
}

export function StatusBar({ provider, chain, connected }: StatusBarProps): React.JSX.Element {
  const time = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return (
    <Box paddingX={1}>
      <Text dimColor>
        <Text color={connected ? 'green' : 'red'}>{connected ? '\u25CF' : '\u25CB'}</Text>{' '}
        <Text bold>{provider}</Text>
      </Text>
      <Text dimColor>{'  \u2502  '}</Text>
      <Text dimColor>
        chain: <Text bold>{chain}</Text>
      </Text>
      <Spacer />
      <Text dimColor>{time}</Text>
    </Box>
  );
}
