// ---------------------------------------------------------------------------
// React hook that wraps the streaming AI provider for the Vizzor TUI
// ---------------------------------------------------------------------------

import { useState, useCallback } from 'react';
import { getProvider, getToolHandler } from '../../ai/client.js';
import { buildChatSystemPrompt, OLLAMA_SYSTEM_PROMPT } from '../../ai/prompts/chat.js';
import { VIZZOR_TOOLS } from '../../ai/tools.js';
import { buildContextBlock } from '../../ai/context-injector.js';

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
 * Calls the active provider's `analyzeStream()` method with the Vizzor system
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

    const provider = getProvider();
    const toolHandler = getToolHandler();

    const callbacks = {
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
    };

    // For providers without tool support, inject real-time data into prompt
    const startStream = async (): Promise<void> => {
      if (!provider.supportsTools) {
        const { contextText: context } = await buildContextBlock(message);
        const systemPrompt = OLLAMA_SYSTEM_PROMPT + (context ? '\n' + context : '');
        await provider.analyzeStream(systemPrompt, message, callbacks);
      } else {
        await provider.analyzeStream(
          buildChatSystemPrompt(),
          message,
          callbacks,
          VIZZOR_TOOLS,
          toolHandler,
        );
      }
    };

    startStream().catch((err: unknown) => {
      const detail = err instanceof Error ? err.message : String(err);
      setIsStreaming(false);
      setActiveTools([]);
      setCompletedTools([]);
      setStreamingText((prev) =>
        prev.length > 0 ? prev + `\n\n[Stream interrupted: ${detail}]` : `[AI error: ${detail}]`,
      );
    });
  }, []);

  return { streamingText, isStreaming, activeTools, completedTools, sendMessage };
}
