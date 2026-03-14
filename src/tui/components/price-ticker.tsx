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
  focused?: boolean;
  onSelect?: (symbol: string) => void;
  onAddPress?: () => void;
}

export function PriceTicker({
  ticker,
  focused = false,
  onSelect: _onSelect,
  onAddPress,
}: PriceTickerProps): React.JSX.Element {
  const { entries, isRefreshing, selectedIndex } = ticker;

  return (
    <Box
      borderStyle="single"
      borderColor={focused ? 'cyan' : 'gray'}
      borderLeft={false}
      borderRight={false}
      borderTop={false}
      paddingX={1}
      gap={3}
    >
      {focused && (
        <Text color="cyan" dimColor>
          {'<'}
        </Text>
      )}
      {entries.map((entry, idx) => {
        const isSelected = focused && selectedIndex === idx;

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
            <Text bold inverse={isSelected} color={isSelected ? 'cyan' : undefined}>
              {isSelected ? `[${entry.symbol}]` : entry.symbol}
            </Text>
            <Text>{formatPrice(entry.price)}</Text>
            <Text color={color}>
              {arrow}
              {prefix}
              {entry.change24h.toFixed(1)}%
            </Text>
          </Box>
        );
      })}
      {focused && (
        <Text color="cyan" dimColor>
          {'>'}
        </Text>
      )}
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
      {focused && <Text dimColor>Tab:exit | Enter:analyze</Text>}
    </Box>
  );
}
