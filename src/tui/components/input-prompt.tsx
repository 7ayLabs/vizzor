import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputPromptProps {
  onSubmit: (value: string) => void;
  disabled?: boolean;
}

export function InputPrompt({ onSubmit, disabled = false }: InputPromptProps): React.JSX.Element {
  const [value, setValue] = useState('');

  const handleSubmit = (submitted: string): void => {
    const trimmed = submitted.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
    setValue('');
  };

  return (
    <Box>
      <Text color="green" bold>
        {'❯ '}
      </Text>
      {disabled ? (
        <Text dimColor>Waiting for response...</Text>
      ) : (
        <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
      )}
    </Box>
  );
}
