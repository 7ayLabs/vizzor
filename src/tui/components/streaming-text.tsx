import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
}

export function StreamingText({ text, isStreaming }: StreamingTextProps): React.JSX.Element {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={1}>
        <Text color="#4A9EFF" bold>
          {'\u25C6'} Vizzor
        </Text>
        {isStreaming && (
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
        )}
      </Box>
      <Box
        borderStyle="single"
        borderLeft
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        borderColor="#4A9EFF"
        paddingLeft={1}
        marginLeft={1}
      >
        <Text wrap="wrap">
          {text}
          {isStreaming ? <Text dimColor>{'\u2588'}</Text> : null}
        </Text>
      </Box>
    </Box>
  );
}
