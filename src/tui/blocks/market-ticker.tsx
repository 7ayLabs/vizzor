import React from 'react';
import { Box, Text } from 'ink';

interface MarketTickerProps {
  symbol: string;
  price: number;
  change24h: number;
  volume: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

function formatVolume(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

export function MarketTicker({
  symbol,
  price,
  change24h,
  volume,
}: MarketTickerProps): React.JSX.Element {
  const changeColor = change24h >= 0 ? 'green' : 'red';
  const changePrefix = change24h >= 0 ? '+' : '';

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderLeft
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      borderColor="magenta"
      paddingLeft={1}
    >
      <Text bold>{'📈 Market'}</Text>
      <Text>
        {symbol.toUpperCase()}: <Text bold>{formatCurrency(price)}</Text>
      </Text>
      <Text>
        24h:{' '}
        <Text color={changeColor} bold>
          {changePrefix}
          {change24h.toFixed(2)}%
        </Text>
      </Text>
      <Text>
        Volume: <Text bold>{formatVolume(volume)}</Text>
      </Text>
    </Box>
  );
}
