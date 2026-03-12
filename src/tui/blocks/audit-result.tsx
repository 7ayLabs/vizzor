import React from 'react';
import { Box, Text } from 'ink';

interface Finding {
  severity: string;
  description: string;
}

interface AuditResultProps {
  findings: Finding[];
}

function getSeverityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical':
      return 'red';
    case 'high':
      return 'red';
    case 'medium':
      return 'yellow';
    case 'low':
      return 'green';
    case 'info':
      return 'blue';
    default:
      return 'white';
  }
}

function getSeverityIcon(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical':
      return '\u2718';
    case 'high':
      return '\u2718';
    case 'medium':
      return '\u26A0';
    case 'low':
      return '\u25CB';
    case 'info':
      return '\u2139';
    default:
      return '\u2022';
  }
}

export function AuditResult({ findings }: AuditResultProps): React.JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text inverse bold color="yellow">
        {' AUDIT RESULTS '}
      </Text>
      {findings.length === 0 ? (
        <Text color="green">No findings detected.</Text>
      ) : (
        findings.map((finding, idx) => {
          const color = getSeverityColor(finding.severity);
          const icon = getSeverityIcon(finding.severity);
          return (
            <Box key={idx} gap={1}>
              <Text color={color}>{icon}</Text>
              <Text color={color} bold>
                [{finding.severity.toUpperCase()}]
              </Text>
              <Text>{finding.description}</Text>
            </Box>
          );
        })
      )}
    </Box>
  );
}
