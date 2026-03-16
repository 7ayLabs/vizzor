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

// Tool display labels
const TOOL_DONE_LABELS: Record<string, string> = {
  get_token_info: 'Token info',
  analyze_wallet: 'Wallet analysis',
  check_rug_indicators: 'Rug check',
  get_market_data: 'Market data',
  search_upcoming_icos: 'ICO search',
  search_token_dex: 'DEX search',
  get_trending: 'Trending',
  get_crypto_news: 'News',
  get_raises: 'Raises',
  get_token_security: 'Security',
  get_prediction: 'Prediction',
  get_ml_prediction: 'ML prediction',
  get_technical_analysis: 'Technical analysis',
  get_ta_ml_analysis: 'ML analysis',
  get_fear_greed: 'Fear & greed',
  get_derivatives_data: 'Derivatives',
  analyze_news_sentiment: 'Sentiment',
  get_market_structure: 'Market structure',
  get_fvg_analysis: 'FVG analysis',
  get_vwap: 'VWAP',
  get_volume_delta: 'Volume delta',
  get_liquidation_map: 'Liquidation map',
  get_order_book_depth: 'Order book',
  get_sr_zones: 'S/R zones',
  get_squeeze_detector: 'Squeeze detector',
  get_chronovisor_prediction: 'Chronovisor',
};

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
          {/* Tool calls — compact collapsible group */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <ToolCallsGroup toolCalls={message.toolCalls} />
          )}

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

/** Compact collapsible group for all tool calls.
 *  While streaming: shows live progress bar with current tool name.
 *  After done: shows summary pill, expandable to see individual cards.
 */
function ToolCallsGroup({ toolCalls }: { toolCalls: ToolCallResult[] }) {
  const [expanded, setExpanded] = useState(false);

  const doneCount = toolCalls.filter((tc) => tc.status === 'done').length;
  const errorCount = toolCalls.filter((tc) => tc.status === 'error').length;
  const pendingCount = toolCalls.filter((tc) => tc.status === 'pending').length;
  const total = toolCalls.length;
  const allDone = pendingCount === 0 && total > 0;

  // Find the currently running tool
  const currentPending = toolCalls.find((tc) => tc.status === 'pending');
  const currentLabel = currentPending
    ? (TOOL_DONE_LABELS[currentPending.tool] ?? currentPending.tool.replace(/_/g, ' '))
    : null;

  // Last completed tool
  const lastDone = [...toolCalls].reverse().find((tc) => tc.status === 'done');
  const lastDoneLabel = lastDone
    ? (TOOL_DONE_LABELS[lastDone.tool] ?? lastDone.tool.replace(/_/g, ' '))
    : null;

  return (
    <div className="w-full rounded-lg border border-[var(--border)] overflow-hidden animate-fade-up">
      {/* Summary header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-3 py-2 text-xs bg-[var(--card)] hover:bg-[var(--card-hover)] transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Status icon */}
          {!allDone ? (
            <span className="inline-flex gap-0.5">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </span>
          ) : errorCount > 0 ? (
            <i className="fa-solid fa-circle-exclamation text-[var(--danger)] text-[10px]" />
          ) : (
            <i className="fa-solid fa-circle-check text-[var(--success)] text-[10px]" />
          )}

          {/* Label */}
          <span className="text-[var(--foreground)] font-medium truncate text-[11px]">
            {!allDone ? (
              <>
                {currentLabel ? (
                  <span className="text-[var(--text-secondary)]">{currentLabel}</span>
                ) : lastDoneLabel ? (
                  <span className="text-[var(--text-secondary)]">{lastDoneLabel}</span>
                ) : (
                  'Loading data'
                )}
                <span className="text-[var(--text-muted)] ml-1.5">
                  {doneCount}/{total}
                </span>
              </>
            ) : (
              <>
                <span className="text-[var(--text-secondary)]">
                  {total} tool{total !== 1 ? 's' : ''} completed
                </span>
                {errorCount > 0 && (
                  <span className="text-[var(--danger)] ml-1.5">({errorCount} failed)</span>
                )}
              </>
            )}
          </span>
        </div>

        {/* Progress bar (while loading) or chevron (when done) */}
        <div className="flex items-center gap-2 shrink-0">
          {!allDone && (
            <div className="w-16 h-1 rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--success)] transition-all duration-300"
                style={{ width: `${total > 0 ? (doneCount / total) * 100 : 0}%` }}
              />
            </div>
          )}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className={`text-[var(--muted)] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          >
            <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
      </button>

      {/* Expanded: show individual tool cards */}
      {expanded && (
        <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
          {toolCalls.map((tc, i) => (
            <div key={`${tc.tool}-${i}`}>
              <ToolResultCard toolCall={tc} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Collapsible wrapper for long assistant responses.
 *  During streaming: auto-collapses if content exceeds threshold, shows "Generating..." toggle.
 *  After streaming: shows "Show more/less" toggle for long responses.
 */
function CollapsibleContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isLong, setIsLong] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // User explicitly expanded during streaming — respect that choice
  const [userExpanded, setUserExpanded] = useState(false);

  useEffect(() => {
    if (!contentRef.current) return;
    const height = contentRef.current.scrollHeight;
    if (height > COLLAPSE_THRESHOLD) {
      setIsLong(true);
      // Auto-collapse during streaming (unless user expanded), or on first detection after stream ends
      if (!userExpanded) {
        setCollapsed(true);
      }
    }
  }, [content, isStreaming, userExpanded]);

  // Reset user expanded when streaming finishes
  useEffect(() => {
    if (!isStreaming) setUserExpanded(false);
  }, [isStreaming]);

  const handleToggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (!next) setUserExpanded(true);
  };

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
            <div className="absolute bottom-8 left-0 right-0 h-16 bg-gradient-to-t from-[rgba(10,10,10,1)] to-transparent rounded-b-xl pointer-events-none" />
          )}
          <button
            onClick={handleToggle}
            className="flex items-center gap-1.5 mx-auto mt-1 px-3 py-1 text-[11px] text-[#a1a1a1] hover:text-white transition-colors rounded-full bg-white/[0.04] hover:bg-white/[0.08]"
          >
            {isStreaming && collapsed ? (
              <>
                <span className="inline-flex gap-0.5 mr-1">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </span>
                Generating — show full response
              </>
            ) : (
              <>
                <i
                  className={`fa-solid ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'} text-[9px]`}
                />
                {collapsed ? 'Show more' : 'Show less'}
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}
