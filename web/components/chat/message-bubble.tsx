'use client';

import type { ChatMessage } from '@/lib/types';
import { renderMarkdown } from '@/lib/markdown';
import { ToolResultCard } from './tool-result-card';

/** Vizzor brand avatar — FA diamond */
function VizzorIcon() {
  return <i className="fa-solid fa-diamond text-[var(--primary)] text-[10px]" />;
}

/** User avatar — FA user */
function UserIcon() {
  return <i className="fa-solid fa-user text-[var(--accent-orange)] text-[10px]" />;
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="w-full animate-msg-right" data-role="user">
        <div className="flex w-full items-start justify-end gap-2">
          <div className="max-w-[90%]">
            <div className="tui-border-left-user rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words bg-[var(--accent-orange)]/8 text-[var(--foreground)]">
              {message.content}
            </div>
          </div>
          <div className="flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-orange)]/15 mt-0.5">
            <UserIcon />
          </div>
        </div>
      </div>
    );
  }

  // Assistant — thinking state with TUI dots
  if (message.isStreaming && !message.content && (message.toolCalls?.length ?? 0) === 0) {
    return (
      <div className="w-full animate-msg-left" data-role="assistant">
        <div className="flex items-start gap-2">
          <div className="flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/15 animate-breathe mt-0.5">
            <VizzorIcon />
          </div>
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex items-center gap-2 text-[var(--muted)] text-xs">
              <span>Thinking</span>
              <span className="inline-flex gap-0.5">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Assistant — content with TUI left-border style
  return (
    <div className="w-full animate-msg-left" data-role="assistant">
      <div className="flex w-full items-start gap-2">
        <div className="flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/15 mt-0.5">
          <VizzorIcon />
        </div>

        <div className="flex flex-col gap-2 min-w-0 flex-1">
          {/* Tool calls — animated entry */}
          {message.toolCalls?.map((tc, i) => (
            <div
              key={`${tc.tool}-${i}`}
              className="animate-fade-up"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <ToolResultCard toolCall={tc} />
            </div>
          ))}

          {/* Text content with TUI left border */}
          {message.content && (
            <div className="tui-border-left chat-content text-sm leading-relaxed text-[var(--foreground)]">
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
              {message.isStreaming && <span className="streaming-cursor" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
