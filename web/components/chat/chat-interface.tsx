'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useChat } from '@/hooks/use-chat';
import { ChatInput } from './chat-input';
import { MessageBubble } from './message-bubble';
import { VizzorLogo } from '@/components/ui/vizzor-logo';

const SUGGESTIONS = [
  {
    icon: 'fa-solid fa-chart-simple',
    label: 'Market price',
    text: 'What is the current price of BTC?',
    color: 'var(--text-secondary)',
  },
  {
    icon: 'fa-solid fa-fire',
    label: 'Trending tokens',
    text: 'Show me trending tokens right now',
    color: 'var(--success)',
  },
  {
    icon: 'fa-solid fa-shield-halved',
    label: 'Security check',
    text: 'Check if this token is safe: 0x...',
    color: 'var(--danger)',
  },
  {
    icon: 'fa-solid fa-wand-magic-sparkles',
    label: 'Prediction',
    text: 'Give me a prediction for ETH',
    color: 'var(--text-secondary)',
  },
];

export function ChatInterface() {
  const { messages, isStreaming, sendMessage, stopStreaming, clearChat } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleReply = useCallback((messageId: string) => {
    setReplyingTo(messageId);
  }, []);

  const handleSend = useCallback(
    (content: string) => {
      sendMessage(content, replyingTo ?? undefined);
      setReplyingTo(null);
    },
    [sendMessage, replyingTo],
  );

  const cancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  // Find the message being replied to
  const replyMessage = replyingTo ? messages.find((m) => m.id === replyingTo) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          /* Empty state — TUI-inspired welcome */
          <div className="flex flex-col items-center justify-center h-full px-4 sm:px-6">
            <div className="flex flex-col items-center gap-5 max-w-lg w-full text-center animate-fade-up">
              {/* Vizzor diamond logo */}
              <VizzorLogo size={56} className="sm:w-16 sm:h-16" />

              <div>
                <h2 className="text-base sm:text-lg font-bold mb-1.5">
                  <span className="text-white">vizzor</span>
                  <span className="text-[var(--text-muted)] text-xs sm:text-sm font-normal ml-2">
                    AI crypto chronovisor
                  </span>
                </h2>
                <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">
                  Ask anything about crypto — prices, trends, security, predictions, and on-chain
                  intelligence.
                </p>
              </div>

              {/* Suggestion chips — 2x2 grid with stagger animation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full mt-1">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={s.label}
                    onClick={() => sendMessage(s.text)}
                    className={`suggestion-chip flex items-start gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] p-3 sm:p-3.5 text-left hover:bg-white/[0.08] active:bg-white/[0.12] animate-scale-pop stagger-${i + 1}`}
                  >
                    <i className={`${s.icon} text-sm shrink-0 mt-0.5`} style={{ color: s.color }} />
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-white block">{s.label}</span>
                      <span className="text-[10px] sm:text-[11px] text-[var(--text-muted)] line-clamp-2 block mt-0.5">
                        {s.text}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Messages list */
          <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-10 py-4 sm:py-6 space-y-4 sm:space-y-5">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} onReply={handleReply} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Reply indicator */}
      {replyMessage && (
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 md:px-10">
          <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-t-xl text-xs text-[var(--text-muted)]">
            <i className="fa-solid fa-reply text-[10px]" />
            <span className="truncate flex-1">
              Replying to: {replyMessage.content.slice(0, 80)}
              {replyMessage.content.length > 80 ? '...' : ''}
            </span>
            <button onClick={cancelReply} className="p-1 hover:text-white transition-colors">
              <i className="fa-solid fa-xmark text-[10px]" />
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="max-w-5xl mx-auto w-full">
        <ChatInput
          onSend={handleSend}
          onStop={stopStreaming}
          onClear={messages.length > 0 ? clearChat : undefined}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
