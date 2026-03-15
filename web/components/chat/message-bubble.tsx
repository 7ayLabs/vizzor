'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage, ToolCallResult, TokenDataPoint } from '@/lib/types';
import { renderMarkdown } from '@/lib/markdown';
import { ToolResultCard } from './tool-result-card';
import { MessageActions } from './message-actions';
import { TradeActionCard } from './trade-action-card';
import { VizzorLogo } from '@/components/ui/vizzor-logo';

const COLLAPSE_THRESHOLD = 400; // px height threshold for collapsing
// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = (_id: string) => {};

/** Vizzor brand avatar */
function VizzorIcon() {
  return <VizzorLogo size={20} />;
}

/** User avatar — FA user */
function UserIcon() {
  return <i className="fa-solid fa-user text-white/40 text-[10px]" />;
}

/** Extract trade-relevant data from tool call results and/or structured token data */
function extractTradeCards(
  toolCalls?: ToolCallResult[],
  tokenData?: TokenDataPoint[],
): { symbol: string; price: number; change24h: number; safetyScore?: number }[] {
  const cards: { symbol: string; price: number; change24h: number; safetyScore?: number }[] = [];
  const seen = new Set<string>();

  // Source 1: Tool call results (from providers with tool support)
  if (toolCalls) {
    for (const tc of toolCalls) {
      if (tc.status !== 'done' || !tc.result) continue;
      const r = tc.result as Record<string, unknown>;

      // get_market_data / search_token_dex results
      if (tc.tool === 'get_market_data' || tc.tool === 'search_token_dex') {
        const symbol = String(r['symbol'] || r['name'] || '').toUpperCase();
        const price = Number(r['price'] || r['priceUsd'] || 0);
        const change = Number(r['priceChange24h'] || r['change24h'] || 0);
        if (symbol && price > 0 && !seen.has(symbol)) {
          seen.add(symbol);
          cards.push({ symbol, price, change24h: change });
        }
      }

      // preview_trade results
      if (tc.tool === 'preview_trade') {
        const symbol = String(r['symbol'] || '').toUpperCase();
        const price = Number(r['currentPrice'] || r['price'] || 0);
        const safety = r['safetyScore'] !== undefined ? Number(r['safetyScore']) : undefined;
        if (symbol && price > 0 && !seen.has(symbol)) {
          seen.add(symbol);
          cards.push({ symbol, price, change24h: 0, safetyScore: safety });
        }
      }

      // get_token_security / check_rug_indicators — extract safety score for existing cards
      if (tc.tool === 'get_token_security' || tc.tool === 'check_rug_indicators') {
        const riskScore = Number(r['riskScore'] || 0);
        const riskLevel = String(r['riskLevel'] || '');
        const safety =
          riskLevel === 'safe'
            ? 85
            : riskLevel === 'warning'
              ? 50
              : riskLevel === 'danger'
                ? 15
                : 100 - riskScore;
        // Try to attach to an existing card
        for (const card of cards) {
          if (card.safetyScore === undefined) {
            card.safetyScore = safety;
            break;
          }
        }
      }
    }
  }

  // Source 2: Structured token data from context injector (for non-tool providers like Ollama)
  if (tokenData) {
    for (const td of tokenData) {
      if (td.price > 0 && !seen.has(td.symbol)) {
        seen.add(td.symbol);
        cards.push({ symbol: td.symbol, price: td.price, change24h: td.change24h });
      }
    }
  }

  return cards;
}

interface MessageBubbleProps {
  message: ChatMessage;
  onReply?: (messageId: string) => void;
}

export function MessageBubble({ message, onReply }: MessageBubbleProps) {
  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content).catch(() => {
      /* ignore */
    });
  }, []);

  if (message.role === 'user') {
    return (
      <div className="w-full animate-msg-right" data-role="user">
        <div className="flex w-full items-start justify-end gap-2">
          <div className="max-w-[90%]">
            {message.parentMessageId && (
              <div className="text-[10px] text-[var(--text-muted)] mb-1 flex items-center gap-1">
                <i className="fa-solid fa-reply text-[8px]" />
                <span>Thread reply</span>
              </div>
            )}
            <div className="rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words bg-white/[0.08] text-white">
              {message.content}
            </div>
          </div>
          <div className="flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] mt-0.5">
            <UserIcon />
          </div>
        </div>
      </div>
    );
  }

  // Assistant — thinking state with dots
  if (message.isStreaming && !message.content && (message.toolCalls?.length ?? 0) === 0) {
    return (
      <div className="w-full animate-msg-left" data-role="assistant">
        <div className="flex items-start gap-2">
          <div className="flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] animate-breathe mt-0.5">
            <VizzorIcon />
          </div>
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
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

  // Extract trade action cards from tool results
  const tradeCards = extractTradeCards(message.toolCalls, message.tokenData);

  // Assistant — content with glass bubble style
  return (
    <div className="w-full animate-msg-left group" data-role="assistant">
      <div className="flex w-full items-start gap-2">
        <div className="flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] mt-0.5">
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

          {/* Text content with glass bubble — collapsible if long */}
          {message.content && (
            <CollapsibleContent content={message.content} isStreaming={message.isStreaming} />
          )}

          {/* Trade action cards — shown after tool results with market data */}
          {tradeCards.length > 0 && !message.isStreaming && (
            <div className="flex flex-wrap gap-2 animate-fade-up">
              {tradeCards.map((card) => (
                <TradeActionCard
                  key={card.symbol}
                  symbol={card.symbol}
                  price={card.price}
                  change24h={card.change24h}
                  safetyScore={card.safetyScore}
                />
              ))}
            </div>
          )}

          {/* Message actions — reply + copy (visible on hover) */}
          {!message.isStreaming && message.content && (
            <MessageActions
              messageId={message.id}
              content={message.content}
              onReply={onReply ?? noop}
              onCopy={handleCopy}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Collapsible wrapper for long assistant responses */
function CollapsibleContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isLong, setIsLong] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!contentRef.current || isStreaming) return;
    const height = contentRef.current.scrollHeight;
    if (height > COLLAPSE_THRESHOLD) {
      setIsLong(true);
      setCollapsed(true);
    }
  }, [content, isStreaming]);

  return (
    <div className="relative">
      <div
        ref={contentRef}
        className={`rounded-xl bg-white/[0.04] px-3 py-2 chat-content text-sm leading-relaxed text-white animate-fadeIn transition-[max-height] duration-300 ease-in-out ${
          collapsed ? 'max-h-[300px] overflow-hidden' : ''
        }`}
      >
        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
        {isStreaming && <span className="streaming-cursor" />}
      </div>

      {/* Fade overlay + collapse toggle */}
      {isLong && (
        <>
          {collapsed && (
            <div className="absolute bottom-8 left-0 right-0 h-16 bg-gradient-to-t from-[#0a0a0a] to-transparent rounded-b-xl pointer-events-none" />
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-1.5 mx-auto mt-1 px-3 py-1 text-[11px] text-[#a1a1a1] hover:text-white transition-colors rounded-full bg-white/[0.04] hover:bg-white/[0.08]"
          >
            <i
              className={`fa-solid ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'} text-[9px]`}
            />
            {collapsed ? 'Show more' : 'Show less'}
          </button>
        </>
      )}
    </div>
  );
}
