import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

const TOOL_LABELS: Record<string, { active: string; done: string }> = {
  get_token_info: { active: 'Fetching token info...', done: 'Token info loaded' },
  analyze_wallet: { active: 'Analyzing wallet...', done: 'Wallet analyzed' },
  check_rug_indicators: { active: 'Checking rug indicators...', done: 'Rug check complete' },
  get_market_data: { active: 'Fetching market data...', done: 'Market data loaded' },
  search_upcoming_icos: { active: 'Searching ICOs...', done: 'ICO search complete' },
  search_token_dex: { active: 'Searching DEX pairs...', done: 'DEX search complete' },
  get_trending: { active: 'Fetching trending tokens...', done: 'Trending loaded' },
  get_crypto_news: { active: 'Fetching crypto news...', done: 'News loaded' },
  get_raises: { active: 'Fetching recent raises...', done: 'Raises loaded' },
};

interface ToolStatusListProps {
  active: string[];
  completed: string[];
}

export function ToolStatusList({
  active,
  completed,
}: ToolStatusListProps): React.JSX.Element | null {
  if (active.length === 0 && completed.length === 0) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderLeft
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      borderColor="gray"
      paddingLeft={1}
      marginLeft={2}
    >
      {completed.map((tool) => {
        const labels = TOOL_LABELS[tool] ?? { done: `${tool} complete` };
        return (
          <Box key={`done-${tool}`} gap={1}>
            <Text color="green">{'\u2713'}</Text>
            <Text>{labels.done}</Text>
          </Box>
        );
      })}
      {active.map((tool) => {
        const labels = TOOL_LABELS[tool] ?? { active: `Running ${tool}...` };
        return (
          <Box key={`active-${tool}`} gap={1}>
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
            <Text dimColor>{labels.active}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

// Keep backward compat export
interface ToolStatusProps {
  toolName: string;
  isActive: boolean;
}

export function ToolStatus({ toolName, isActive }: ToolStatusProps): React.JSX.Element {
  return (
    <ToolStatusList active={isActive ? [toolName] : []} completed={isActive ? [] : [toolName]} />
  ) as React.JSX.Element;
}
