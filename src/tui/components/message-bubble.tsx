import React from 'react';
import { Box, Text } from 'ink';
import type { Message, RichBlock } from './message-list.js';
import { RichBlockRenderer } from './message-list.js';
import { StyledText } from './styled-text.js';

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps): React.JSX.Element {
  const isUser = message.role === 'user';
  const color = isUser ? '#FFA500' : '#4A9EFF';
  const icon = isUser ? '\u25CF' : '\u25C6';
  const label = isUser ? 'You' : 'Vizzor';
  const time = message.timestamp ? formatTime(message.timestamp) : '';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={1}>
        <Text color={color} bold>
          {icon} {label}
        </Text>
        {time && <Text dimColor>{time}</Text>}
      </Box>

      <Box
        borderStyle="single"
        borderLeft
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        borderColor={color}
        paddingLeft={1}
        marginLeft={1}
        flexDirection="column"
      >
        {isUser ? (
          <Text wrap="wrap">{message.content}</Text>
        ) : (
          <StyledText text={message.content} />
        )}
        {message.blocks?.map((block: RichBlock, idx: number) => (
          <Box key={idx} marginTop={1}>
            <RichBlockRenderer block={block} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
