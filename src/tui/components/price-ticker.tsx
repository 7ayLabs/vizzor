import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { UsePriceTickerResult } from '../hooks/use-price-ticker.js';

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

interface PriceTickerProps {
  ticker: UsePriceTickerResult;
  onAddPress?: () => void;
}

export function PriceTicker({ ticker, onAddPress }: PriceTickerProps): React.JSX.Element {
  const { entries, isRefreshing } = ticker;

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      borderLeft={false}
      borderRight={false}
      borderTop={false}
      paddingX={1}
      gap={3}
    >
      {entries.map((entry) => {
        if (entry.loading) {
          return (
            <Box key={entry.geckoId} gap={1}>
              <Text dimColor>{entry.symbol}</Text>
              <Text color="cyan">
                <Spinner type="dots" />
              </Text>
            </Box>
          );
        }
        if (entry.error) {
          return (
            <Box key={entry.geckoId} gap={1}>
              <Text dimColor>{entry.symbol}</Text>
              <Text color="red">--</Text>
            </Box>
          );
        }
        const color = entry.change24h >= 0 ? 'green' : 'red';
        const arrow = entry.change24h >= 0 ? '\u25B2' : '\u25BC';
        const prefix = entry.change24h >= 0 ? '+' : '';
        return (
          <Box key={entry.geckoId} gap={1}>
            <Text bold>{entry.symbol}</Text>
            <Text>{formatPrice(entry.price)}</Text>
            <Text color={color}>
              {arrow}
              {prefix}
              {entry.change24h.toFixed(1)}%
            </Text>
          </Box>
        );
      })}
      {isRefreshing && (
        <Text dimColor>
          <Spinner type="dots" />
        </Text>
      )}
      {onAddPress && (
        <Text color="cyan" dimColor>
          [+]
        </Text>
      )}
    </Box>
  );
}
