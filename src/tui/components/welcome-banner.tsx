import React from 'react';
import { Box, Text } from 'ink';

export function WelcomeBanner(): React.JSX.Element {
  return (
    <Box paddingX={1}>
      <Text bold color="blue">
        vizzor
      </Text>
      <Text dimColor> v0.1.0 — crypto chronovisor. Type /help for commands.</Text>
    </Box>
  );
}
