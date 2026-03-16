'use client';

import { useState } from 'react';

interface MessageActionsProps {
  messageId: string;
  onReply: (messageId: string) => void;
  onCopy: (content: string) => void;
  content: string;
}

export function MessageActions({ messageId, onReply, onCopy, content }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={() => onReply(messageId)}
        className="p-1.5 rounded-md hover:bg-white/[0.08] text-[var(--text-muted)] hover:text-white transition-colors"
        title="Reply in thread"
      >
        <i className="fa-solid fa-reply text-xs" />
      </button>
      <button
        onClick={handleCopy}
        className="p-1.5 rounded-md hover:bg-white/[0.08] text-[var(--text-muted)] hover:text-white transition-colors"
        title="Copy"
      >
        <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} text-xs`} />
      </button>
    </div>
  );
}
