import React from 'react';
import { Box, Text } from 'ink';

interface TokenCardProps {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
}

function formatWithCommas(value: string): string {
  const parts = value.split('.');
  const intPart = parts[0] ?? '';
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? `${formatted}.${parts[1]}` : formatted;
}

export function TokenCard({
  name,
  symbol,
  decimals,
  totalSupply,
}: TokenCardProps): React.JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
      <Text inverse bold color="blue">
        {' TOKEN '}
      </Text>
      <Text>
        Name: <Text bold>{name}</Text> <Text dimColor>({symbol})</Text>
      </Text>
      <Text>
        Decimals: <Text bold>{decimals}</Text>
      </Text>
      <Text>
        Supply: <Text bold>{formatWithCommas(totalSupply)}</Text>
      </Text>
    </Box>
  );
}
