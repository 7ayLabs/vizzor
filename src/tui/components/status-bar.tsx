import React, { useState, useEffect } from 'react';
import { Box, Text, Spacer } from 'ink';

interface StatusBarProps {
  provider: string;
  chain: string;
  connected: boolean;
  unreadCount?: number;
}

export const StatusBar = React.memo(function StatusBar({
  provider,
  chain,
  connected,
  unreadCount = 0,
}: StatusBarProps): React.JSX.Element {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
  );

  // Update time once per minute instead of every re-render
  useEffect(() => {
    const id = setInterval(() => {
      setTime(
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
      );
    }, 60_000);
    return () => clearInterval(id);
  }, []);

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
      {unreadCount > 0 && (
        <>
          <Text dimColor>{'  \u2502  '}</Text>
          <Text color="yellow" bold>
            {'\u{1F514}'} {unreadCount}
          </Text>
        </>
      )}
      <Spacer />
      <Text dimColor>{time}</Text>
    </Box>
  );
});
