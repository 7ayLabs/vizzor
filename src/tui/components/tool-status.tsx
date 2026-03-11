import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

const TOOL_LABELS: Record<string, { active: string; done: string }> = {
  get_token_info: { active: 'Fetching token info...', done: 'Token info loaded' },
  analyze_wallet: { active: 'Analyzing wallet...', done: 'Wallet analyzed' },
  check_rug_indicators: { active: 'Checking rug indicators...', done: 'Rug check complete' },
  get_market_data: { active: 'Fetching market data...', done: 'Market data loaded' },
  search_upcoming_icos: { active: 'Searching ICOs...', done: 'ICO search complete' },
};

interface ToolStatusProps {
  toolName: string;
  isActive: boolean;
}

export function ToolStatus({ toolName, isActive }: ToolStatusProps): React.JSX.Element {
  const labels = TOOL_LABELS[toolName] ?? {
    active: `Running ${toolName}...`,
    done: `${toolName} complete`,
  };

  if (isActive) {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text dimColor> {labels.active}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color="green">{'✓ '}</Text>
      <Text>{labels.done}</Text>
    </Box>
  );
}
