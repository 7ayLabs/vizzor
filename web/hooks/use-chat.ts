'use client';

import { useState, useCallback, useRef } from 'react';
import type { ChatMessage, ToolCallResult } from '@/lib/types';
import { parseSSE } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/constants';

let msgId = 0;
function nextId(): string {
  return `msg-${++msgId}-${Date.now()}`;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      const userMsg: ChatMessage = {
        id: nextId(),
        role: 'user',
        content: content.trim(),
        timestamp: Date.now(),
      };

      const assistantId = nextId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        toolCalls: [],
        timestamp: Date.now(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const allMessages = [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch(`${API_BASE}/v1/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: allMessages }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`API error: ${res.status}`);
        }

        const reader = res.body.getReader();

        for await (const event of parseSSE(reader)) {
          if (controller.signal.aborted) break;

          try {
            const payload = JSON.parse(event.data);

            switch (event.type) {
              case 'text':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: m.content + payload.delta } : m,
                  ),
                );
                break;

              case 'tool_start': {
                const toolCall: ToolCallResult = {
                  tool: payload.tool,
                  input: payload.input ?? {},
                  result: null,
                  status: 'pending',
                };
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, toolCalls: [...(m.toolCalls ?? []), toolCall] }
                      : m,
                  ),
                );
                break;
              }

              case 'tool_result':
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== assistantId) return m;
                    const calls = (m.toolCalls ?? []).map((tc) =>
                      tc.tool === payload.tool && tc.status === 'pending'
                        ? { ...tc, result: payload.result, status: 'done' as const }
                        : tc,
                    );
                    return { ...m, toolCalls: calls };
                  }),
                );
                break;

              case 'done':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: payload.fullText || m.content, isStreaming: false }
                      : m,
                  ),
                );
                break;

              case 'error':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content: m.content + `\n\n**Error:** ${payload.message}`,
                          isStreaming: false,
                        }
                      : m,
                  ),
                );
                break;
            }
          } catch {
            // Skip malformed events
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `**Error:** ${(err as Error).message}`, isStreaming: false }
                : m,
            ),
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)),
        );
      }
    },
    [messages],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, sendMessage, stopStreaming, clearChat };
}
