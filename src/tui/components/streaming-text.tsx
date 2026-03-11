import React from 'react';
import { Text } from 'ink';

interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
}

export function StreamingText({ text, isStreaming }: StreamingTextProps): React.JSX.Element {
  return (
    <Text>
      {text}
      {isStreaming ? <Text dimColor>▊</Text> : null}
    </Text>
  );
}
