import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { StyledText } from './styled-text.js';

// Maximum visible lines during streaming to prevent Ink live-area overflow.
// The full response is preserved in state and added to <Static> after streaming.
const MAX_VISIBLE_LINES = 40;

interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
}

export function StreamingText({ text, isStreaming }: StreamingTextProps): React.JSX.Element {
  const { displayText, isTruncated } = useMemo(() => {
    if (!isStreaming) return { displayText: text, isTruncated: false };

    const lines = text.split('\n');
    if (lines.length <= MAX_VISIBLE_LINES) {
      return { displayText: text, isTruncated: false };
    }

    const visible = lines.slice(-MAX_VISIBLE_LINES);
    return { displayText: visible.join('\n'), isTruncated: true };
  }, [text, isStreaming]);

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
        flexDirection="column"
      >
        {isTruncated && <Text dimColor>{'... (streaming, showing last lines) ...'}</Text>}
        <StyledText text={displayText} />
        {isStreaming && <Text dimColor>{'\u2588'}</Text>}
      </Box>
    </Box>
  );
}
