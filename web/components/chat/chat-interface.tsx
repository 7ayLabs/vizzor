'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useChat } from '@/hooks/use-chat';
import { useNotifications } from '@/hooks/use-notifications';
import { ChatInput } from './chat-input';
import { MessageBubble } from './message-bubble';
import { VizzorLogo } from '@/components/ui/vizzor-logo';
import { cn, formatRelativeTimestamp } from '@/lib/utils';

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
  const { refetch: refetchNotifications } = useNotifications();
  const {
    messages,
    isStreaming,
    conversationId,
    conversations,
    sendMessage,
    stopStreaming,
    clearChat,
    newConversation,
    loadConversation,
    deleteConversation,
  } = useChat({
    onAlertToolResult: refetchNotifications,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Auto-scroll: scroll the parent <main> so the entire page scrolls down
  useEffect(() => {
    // Small delay so DOM has updated with new content
    const timer = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 50);
    return () => clearTimeout(timer);
  }, [messages]);

  const handleReply = useCallback((messageId: string) => {
    setReplyingTo(messageId);
  }, []);

  const handleSend = useCallback(
    (content: string) => {
      sendMessage(content, replyingTo ?? undefined);
      setReplyingTo(null);
      // Close sidebar on mobile after sending
      setSidebarOpen(false);
    },
    [sendMessage, replyingTo],
  );

  const cancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const handleLoadConversation = useCallback(
    (id: string) => {
      void loadConversation(id);
      setSidebarOpen(false);
    },
    [loadConversation],
  );

  const handleNewConversation = useCallback(() => {
    newConversation();
    setSidebarOpen(false);
  }, [newConversation]);

  const handleDeleteConversation = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      void deleteConversation(id);
    },
    [deleteConversation],
  );

  // Find the message being replied to
  const replyMessage = replyingTo ? messages.find((m) => m.id === replyingTo) : null;

  return (
    <div className="relative flex min-h-full">
      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Conversation sidebar — always overlay, never inline */}
      <aside
        className={cn(
          'fixed z-40 top-0 left-0 h-full w-64 bg-[var(--bg-primary)] border-r border-white/[0.08] flex flex-col transition-transform duration-200',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/[0.06]">
          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            History
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleNewConversation}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-[var(--text-secondary)] hover:text-white hover:bg-white/[0.06] transition-colors"
              title="New chat"
            >
              <i className="fa-solid fa-plus text-[10px]" />
              <span>New</span>
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-muted)] hover:text-white hover:bg-white/[0.06] transition-colors"
              title="Close"
            >
              <i className="fa-solid fa-xmark text-xs" />
            </button>
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto py-1">
          {conversations.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">
              No conversations yet
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => handleLoadConversation(conv.id)}
                className={cn(
                  'group flex items-center w-full px-3 py-2.5 text-left hover:bg-white/[0.04] transition-colors',
                  conversationId === conv.id && 'bg-white/[0.06]',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      'text-xs truncate',
                      conversationId === conv.id
                        ? 'text-white font-medium'
                        : 'text-[var(--text-secondary)]',
                    )}
                  >
                    {conv.title}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {formatRelativeTimestamp(conv.updatedAt)}
                    {conv.messageCount > 0 && (
                      <span className="ml-1.5">{conv.messageCount} msgs</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDeleteConversation(e, conv.id)}
                  className="hidden group-hover:flex items-center justify-center w-6 h-6 rounded text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-white/[0.06] transition-colors shrink-0 ml-1"
                  title="Delete conversation"
                >
                  <i className="fa-solid fa-trash text-[10px]" />
                </button>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main chat area — takes full width always */}
      <div className="flex flex-col min-h-full flex-1 min-w-0">
        {/* Messages area -- grows naturally, parent <main> handles scroll */}
        <div ref={scrollRef} className="flex-1">
          {messages.length === 0 ? (
            /* Empty state -- TUI-inspired welcome */
            <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 sm:px-6">
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

                {/* Suggestion chips -- 2x2 grid with stagger animation */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full mt-1">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={s.label}
                      onClick={() => sendMessage(s.text)}
                      className={`suggestion-chip flex items-start gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] p-3 sm:p-3.5 text-left hover:bg-white/[0.08] active:bg-white/[0.12] animate-scale-pop stagger-${i + 1}`}
                    >
                      <i
                        className={`${s.icon} text-sm shrink-0 mt-0.5`}
                        style={{ color: s.color }}
                      />
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
          <div className="sticky bottom-[72px] z-10 max-w-5xl mx-auto w-full px-4 sm:px-6 md:px-10">
            <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-t-xl text-xs text-[var(--text-muted)] backdrop-blur-md">
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

        {/* Input -- sticky at bottom of scroll area */}
        <div className="sticky bottom-0 z-10 bg-[var(--bg-primary)] max-w-5xl mx-auto w-full">
          <div className="flex items-end gap-1.5">
            {/* Compact history toggle button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center justify-center w-9 h-9 ml-3 sm:ml-4 mb-[18px] sm:mb-[20px] rounded-lg border border-white/[0.08] bg-white/[0.04] text-[var(--text-muted)] hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
              title="Chat history"
            >
              <i className="fa-solid fa-clock-rotate-left text-sm" />
            </button>
            <div className="flex-1 min-w-0">
              <ChatInput
                onSend={handleSend}
                onStop={stopStreaming}
                onClear={messages.length > 0 ? clearChat : undefined}
                isStreaming={isStreaming}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
