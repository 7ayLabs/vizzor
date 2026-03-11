import React from 'react';
import { Box, Text, Newline } from 'ink';

export function WelcomeBanner(): React.JSX.Element {
  return (
    <Box
      borderStyle="round"
      borderColor="blue"
      paddingX={2}
      paddingY={1}
      flexDirection="column"
      alignItems="center"
    >
      <Text bold color="blue">
        vizzor v0.1.0
      </Text>
      <Text dimColor>AI-powered crypto chronovisor</Text>
      <Newline />
      <Text>Ask anything or use /commands</Text>
      <Text dimColor>Type /help for available commands</Text>
    </Box>
  );
}
