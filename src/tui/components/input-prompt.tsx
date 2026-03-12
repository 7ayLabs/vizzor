import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputPromptProps {
  onSubmit: (value: string) => void;
  disabled?: boolean;
  onInputChange?: (value: string) => void;
}

export function InputPrompt({
  onSubmit,
  disabled = false,
  onInputChange,
}: InputPromptProps): React.JSX.Element {
  const [value, setValue] = useState('');

  const handleChange = (newValue: string): void => {
    setValue(newValue);
    onInputChange?.(newValue);
  };

  const handleSubmit = (submitted: string): void => {
    const trimmed = submitted.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
    setValue('');
    onInputChange?.('');
  };

  return (
    <Box borderStyle="round" borderColor={disabled ? 'gray' : 'blue'} paddingX={1}>
      {disabled ? (
        <Text dimColor italic>
          thinking...
        </Text>
      ) : (
        <Box>
          <Text bold color="green">
            vizzor
          </Text>
          <Text dimColor>{' > '}</Text>
          <TextInput
            value={value}
            onChange={handleChange}
            onSubmit={handleSubmit}
            placeholder="Ask anything or type / for commands"
          />
        </Box>
      )}
    </Box>
  );
}
