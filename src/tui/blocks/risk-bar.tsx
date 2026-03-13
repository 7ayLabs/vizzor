import React from 'react';
import { Box, Text } from 'ink';

interface RiskBarProps {
  score: number;
  level: string;
  factors?: string[];
}

function getLevelColor(level: string): string {
  switch (level.toLowerCase()) {
    case 'low':
      return 'green';
    case 'medium':
      return 'yellow';
    case 'high':
      return 'red';
    case 'critical':
      return 'red';
    default:
      return 'white';
  }
}

function buildProgressBar(score: number, width = 20): string {
  const clamped = Math.max(0, Math.min(100, score));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

export function RiskBar({ score, level, factors }: RiskBarProps): React.JSX.Element {
  const color = getLevelColor(level);
  const isCritical = level.toLowerCase() === 'critical';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
      <Text inverse bold color={color}>
        {' RISK ASSESSMENT '}
      </Text>
      <Box gap={2}>
        <Text>
          Score:{' '}
          <Text bold color={color}>
            {score}/100
          </Text>
        </Text>
        <Text>
          Level:{' '}
          <Text bold={isCritical} color={color}>
            {level.toUpperCase()}
          </Text>
        </Text>
      </Box>
      <Text color={color}>{buildProgressBar(score)}</Text>
      {factors && factors.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Risk factors:</Text>
          {factors.map((factor, idx) => (
            <Text key={idx} dimColor>
              {'  - '}
              {factor}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
