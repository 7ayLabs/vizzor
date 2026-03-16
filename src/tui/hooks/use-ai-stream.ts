// ---------------------------------------------------------------------------
// React hook that wraps the streaming AI provider for the Vizzor TUI
// ---------------------------------------------------------------------------

import { useState, useCallback, useRef } from 'react';
import { getProvider, getToolHandler } from '../../ai/client.js';
import { buildChatSystemPrompt, OLLAMA_SYSTEM_PROMPT } from '../../ai/prompts/chat.js';
import { VIZZOR_TOOLS } from '../../ai/tools.js';
import { buildContextBlock } from '../../ai/context-injector.js';
import type { ChatMessage } from '../../ai/providers/types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max tokens reserved for conversation history (~24k chars = ~6k tokens). */
const MAX_HISTORY_CHARS = 24_000;

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
  /** Clear the conversation history (call on /clear). */
  clearHistory: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * React hook that manages streaming AI chat sessions with conversation memory.
 *
 * Maintains a rolling conversation history so the AI can reference prior
 * messages. History is automatically trimmed to stay within context limits.
 */
export function useAIStream(): UseAIStreamResult {
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [completedTools, setCompletedTools] = useState<string[]>([]);

  // Rolling conversation history — persists across re-renders via ref
  const historyRef = useRef<ChatMessage[]>([]);

  /** Trim history to stay within approximate token budget. */
  const trimHistory = useCallback((): void => {
    let totalChars = 0;
    let cutIndex = historyRef.current.length;

    for (let i = historyRef.current.length - 1; i >= 0; i--) {
      totalChars += historyRef.current[i].content.length;
      if (totalChars > MAX_HISTORY_CHARS) {
        cutIndex = i + 1;
        break;
      }
      if (i === 0) cutIndex = 0;
    }

    if (cutIndex > 0) {
      historyRef.current = historyRef.current.slice(cutIndex);
    }
  }, []);

  const clearHistory = useCallback((): void => {
    historyRef.current = [];
  }, []);

  const sendMessage = useCallback(
    (message: string): void => {
      // Reset state for a new message
      setStreamingText('');
      setIsStreaming(true);
      setActiveTools([]);
      setCompletedTools([]);

      const provider = getProvider();
      const toolHandler = getToolHandler();

      // Snapshot history before this message (exclude current user message)
      const priorHistory = [...historyRef.current];

      // Add user message to history
      historyRef.current.push({ role: 'user', content: message });

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
        onDone(fullText: string): void {
          // Store assistant response in history
          historyRef.current.push({ role: 'assistant', content: fullText });
          trimHistory();
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
          await provider.analyzeStream(
            systemPrompt,
            message,
            callbacks,
            undefined,
            undefined,
            priorHistory,
          );
        } else {
          await provider.analyzeStream(
            buildChatSystemPrompt(),
            message,
            callbacks,
            VIZZOR_TOOLS,
            toolHandler,
            priorHistory,
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
    },
    [trimHistory],
  );

  return { streamingText, isStreaming, activeTools, completedTools, sendMessage, clearHistory };
}
