// ---------------------------------------------------------------------------
// React hook that wraps the streaming AI client for the Vizzor TUI
// ---------------------------------------------------------------------------

import { useState, useCallback } from 'react';
import { analyzeStream } from '../../ai/stream.js';
import { CHAT_SYSTEM_PROMPT } from '../../ai/prompts/chat.js';
import { VIZZOR_TOOLS } from '../../ai/tools.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseAIStreamResult {
  /** The text accumulated so far from the streaming response. */
  streamingText: string;
  /** Whether the AI is currently streaming a response. */
  isStreaming: boolean;
  /** Tool names currently being executed. */
  activeTools: string[];
  /** Tool names that have finished executing. */
  completedTools: string[];
  /** Send a message to the AI and begin streaming the response. */
  sendMessage: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * React hook that manages streaming AI chat sessions.
 *
 * Calls `analyzeStream()` from `src/ai/stream.ts` with the Vizzor system
 * prompt and tool definitions. Exposes incremental text, tool execution
 * status, and a `sendMessage` callback.
 */
export function useAIStream(): UseAIStreamResult {
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [completedTools, setCompletedTools] = useState<string[]>([]);

  const sendMessage = useCallback((message: string): void => {
    // Reset state for a new message
    setStreamingText('');
    setIsStreaming(true);
    setActiveTools([]);
    setCompletedTools([]);

    analyzeStream(
      CHAT_SYSTEM_PROMPT,
      message,
      {
        onText(delta: string): void {
          setStreamingText((prev) => prev + delta);
        },
        onToolStart(name: string): void {
          setActiveTools((prev) => [...prev, name]);
        },
        onToolEnd(name: string): void {
          setActiveTools((prev) => prev.filter((t) => t !== name));
          setCompletedTools((prev) => [...prev, name]);
        },
        onDone(_fullText: string): void {
          setIsStreaming(false);
          setActiveTools([]);
          setCompletedTools([]);
        },
      },
      VIZZOR_TOOLS,
    ).catch(() => {
      // If the stream fails, ensure we leave a clean state.
      setIsStreaming(false);
      setActiveTools([]);
      setCompletedTools([]);
      setStreamingText((prev) =>
        prev.length > 0
          ? prev + '\n\n[Stream interrupted]'
          : '[Failed to connect to AI. Check your API key and try again.]',
      );
    });
  }, []);

  return { streamingText, isStreaming, activeTools, completedTools, sendMessage };
}
