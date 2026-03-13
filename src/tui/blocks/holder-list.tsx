import React from 'react';
import { Box, Text } from 'ink';

interface HolderEntry {
  address: string;
  percentage: number;
}

interface HolderListProps {
  holders: HolderEntry[];
}

function truncateAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function buildPercentageBar(percentage: number, width = 20): string {
  const clamped = Math.max(0, Math.min(100, percentage));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

export function HolderList({ holders }: HolderListProps): React.JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      <Text inverse bold>
        {' TOP HOLDERS '}
      </Text>
      {holders.map((holder, idx) => (
        <Box key={idx} gap={1}>
          <Text dimColor>{truncateAddress(holder.address)}</Text>
          <Text color="cyan">{buildPercentageBar(holder.percentage)}</Text>
          <Text bold>{holder.percentage.toFixed(2)}%</Text>
        </Box>
      ))}
    </Box>
  );
}
