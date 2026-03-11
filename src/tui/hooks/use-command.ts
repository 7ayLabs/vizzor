// ---------------------------------------------------------------------------
// React hook for slash command execution in the Vizzor TUI
// ---------------------------------------------------------------------------

import { useState, useCallback } from 'react';
import { parseCommand, executeCommand } from '../commands.js';
import type { CommandResult } from '../commands.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseCommandResult {
  /** Whether a slash command is currently executing. */
  isExecuting: boolean;
  /**
   * Parse and execute a slash command string.
   *
   * Returns `null` for `/clear` and `/exit` so the app component can
   * handle those specially. Returns the {@link CommandResult} for all
   * other commands.
   */
  executeSlashCommand: (input: string) => Promise<CommandResult | null>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * React hook that wraps the slash command parser and dispatcher.
 *
 * `/clear` and `/exit` are signalled by returning `null` — the caller is
 * responsible for clearing messages or exiting the process.
 */
export function useCommand(): UseCommandResult {
  const [isExecuting, setIsExecuting] = useState(false);

  const executeSlashCommand = useCallback(async (input: string): Promise<CommandResult | null> => {
    const { name, args } = parseCommand(input);

    // These are handled by the app component, not the command dispatcher.
    if (name === 'clear' || name === 'exit') {
      return null;
    }

    setIsExecuting(true);
    try {
      const result = await executeCommand(name, args);
      return result;
    } finally {
      setIsExecuting(false);
    }
  }, []);

  return { isExecuting, executeSlashCommand };
}
