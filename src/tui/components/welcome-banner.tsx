import React from 'react';
import { Box, Text } from 'ink';

export function WelcomeBanner(): React.JSX.Element {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text bold color="cyan">
          {'  '}
        </Text>
        <Text bold color="blue">
          vizzor
        </Text>
        <Text bold color="cyan">
          {' v0.12.0'}
        </Text>
        <Text dimColor> — AI-powered crypto chronovisor</Text>
      </Box>
      <Box>
        <Text dimColor>
          {
            '  ML models: LSTM + Random Forest + Isolation Forest + GBM Rug + Wallet LSTM + DistilBERT NLP'
          }
        </Text>
      </Box>
      <Box>
        <Text dimColor>{'  Type '}</Text>
        <Text color="yellow">/help</Text>
        <Text dimColor> for commands or ask anything about crypto.</Text>
      </Box>
    </Box>
  );
}
