'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  onClear?: () => void;
  isStreaming: boolean;
}

export function ChatInput({ onSend, onStop, onClear, isStreaming }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    if (!value.trim() || isStreaming) return;
    onSend(value);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, isStreaming, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }
  };

  return (
    <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-2">
      <div className="relative flex items-end gap-1.5 sm:gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1.5 sm:p-2 shadow-sm focus-within:border-[var(--primary)]/50 focus-within:ring-1 focus-within:ring-[var(--primary)]/20 transition-all">
        {/* New chat button */}
        {onClear && (
          <button
            onClick={onClear}
            className="shrink-0 flex items-center justify-center size-10 sm:size-9 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--background)] active:bg-[var(--border)] transition-colors touch-target"
            title="New chat"
          >
            <i className="fa-solid fa-plus text-xs rotate-45" />
          </button>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Ask Vizzor anything..."
          rows={1}
          className="flex-1 resize-none bg-transparent px-2 py-2 sm:py-1.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none"
        />

        {isStreaming ? (
          <button
            onClick={onStop}
            className="shrink-0 flex items-center justify-center size-10 sm:size-9 rounded-lg bg-[var(--danger)] text-white hover:opacity-80 active:opacity-70 transition-all touch-target"
            title="Stop generating"
          >
            <i className="fa-solid fa-stop text-[10px]" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!value.trim()}
            className="shrink-0 flex items-center justify-center size-10 sm:size-9 rounded-lg bg-[var(--primary)] text-white disabled:opacity-20 hover:opacity-80 active:opacity-70 transition-all touch-target"
            title="Send message"
          >
            <i className="fa-solid fa-arrow-up text-xs" />
          </button>
        )}
      </div>
      <p className="text-center text-[10px] sm:text-[11px] text-[var(--muted)] mt-1.5 sm:mt-2">
        Vizzor can make mistakes. Verify important information.
      </p>
    </div>
  );
}
