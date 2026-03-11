// ---------------------------------------------------------------------------
// Vizzor TUI — Root Ink application component
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useCallback } from 'react';
import { render, Box, Text } from 'ink';
import { WelcomeBanner } from './components/welcome-banner.js';
import { MessageList } from './components/message-list.js';
import type { Message } from './components/message-list.js';
import { ToolStatus } from './components/tool-status.js';
import { InputPrompt } from './components/input-prompt.js';
import { StreamingText } from './components/streaming-text.js';
import { useAIStream } from './hooks/use-ai-stream.js';
import { useCommand } from './hooks/use-command.js';
import { isSlashCommand, parseCommand } from './commands.js';
import { loadConfig, getConfig } from '../config/loader.js';
import { DEFAULT_CHAIN } from '../config/constants.js';
import { setConfig, setToolHandler } from '../ai/client.js';
import { VIZZOR_TOOLS } from '../ai/tools.js';
import { getAdapter } from '../chains/registry.js';
import { analyzeWallet } from '../core/forensics/wallet-analyzer.js';
import { detectRugIndicators } from '../core/forensics/rug-detector.js';
import { fetchMarketData, fetchTokenFromDex, fetchTrendingTokens } from '../core/trends/market.js';
import { fetchUpcomingICOs, searchICOs } from '../core/scanner/ico-tracker.js';
import { fetchCryptoNews } from '../data/sources/cryptopanic.js';
import { fetchRecentRaises } from '../data/sources/defillama.js';

// ---------------------------------------------------------------------------
// Tool handler — bridges Claude tool-use to Vizzor core modules
// ---------------------------------------------------------------------------

async function handleTool(name: string, input: unknown): Promise<unknown> {
  const params = input as Record<string, unknown>;

  switch (name) {
    case 'get_token_info': {
      const address = String(params['address'] ?? '');
      const chain = String(params['chain'] ?? DEFAULT_CHAIN);
      const adapter = getAdapter(chain);
      await adapter.connect(undefined, getConfig().etherscanApiKey);
      const info = await adapter.getTokenInfo(address);
      return {
        address: info.address,
        name: info.name,
        symbol: info.symbol,
        decimals: info.decimals,
        totalSupply: info.totalSupply.toString(),
      };
    }

    case 'analyze_wallet': {
      const address = String(params['address'] ?? '');
      const chain = String(params['chain'] ?? DEFAULT_CHAIN);
      const adapter = getAdapter(chain);
      await adapter.connect(undefined, getConfig().etherscanApiKey);
      const analysis = await analyzeWallet(address, adapter);
      return {
        address: analysis.address,
        chain: analysis.chain,
        balance: analysis.balance.toString(),
        transactionCount: analysis.transactionCount,
        riskLevel: analysis.riskLevel,
        patterns: analysis.patterns,
      };
    }

    case 'check_rug_indicators': {
      const address = String(params['address'] ?? '');
      const chain = String(params['chain'] ?? DEFAULT_CHAIN);
      const adapter = getAdapter(chain);
      await adapter.connect(undefined, getConfig().etherscanApiKey);
      const indicators = await detectRugIndicators(address, adapter);
      return {
        isHoneypot: indicators.isHoneypot,
        hasLiquidityLock: indicators.hasLiquidityLock,
        ownerCanMint: indicators.ownerCanMint,
        ownerCanPause: indicators.ownerCanPause,
        hasBlacklist: indicators.hasBlacklist,
        highSellTax: indicators.highSellTax,
        riskScore: indicators.riskScore,
        details: indicators.details,
      };
    }

    case 'get_market_data': {
      const symbol = String(params['symbol'] ?? '');
      const data = await fetchMarketData(symbol);
      if (!data) {
        return { error: `No market data found for "${symbol}"` };
      }
      return data;
    }

    case 'search_upcoming_icos': {
      const category = params['category'] ? String(params['category']) : undefined;
      const chain = params['chain'] ? String(params['chain']) : undefined;
      const projects =
        category || chain
          ? await searchICOs(undefined, category, chain)
          : await fetchUpcomingICOs();
      return { projects };
    }

    case 'search_token_dex': {
      const query = String(params['query'] ?? '');
      const pairs = await fetchTokenFromDex(query);
      return {
        results: pairs.slice(0, 5).map((p) => ({
          name: p.baseToken.name,
          symbol: p.baseToken.symbol,
          chain: p.chainId,
          dex: p.dexId,
          priceUsd: p.priceUsd,
          volume24h: p.volume?.h24 ?? 0,
          liquidity: p.liquidity?.usd ?? 0,
          priceChange24h: p.priceChange?.h24 ?? 0,
          marketCap: p.marketCap ?? p.fdv ?? null,
          buys24h: p.txns?.h24?.buys ?? 0,
          sells24h: p.txns?.h24?.sells ?? 0,
          pairAddress: p.pairAddress,
          url: p.url,
        })),
      };
    }

    case 'get_trending': {
      const trending = await fetchTrendingTokens();
      return {
        trending: trending.slice(0, 10).map((t) => ({
          name: t.name,
          symbol: t.symbol,
          chain: t.chain,
          priceUsd: t.priceUsd,
          priceChange24h: t.priceChange24h,
          volume24h: t.volume24h,
          marketCap: t.marketCap,
          source: t.source,
          url: t.url,
        })),
      };
    }

    case 'get_crypto_news': {
      const symbol = params['symbol'] ? String(params['symbol']) : undefined;
      const news = await fetchCryptoNews(symbol, getConfig().cryptopanicApiKey);
      return {
        news: news.slice(0, 10).map((n) => ({
          title: n.title,
          sentiment: n.sentiment,
          source: n.source.title,
          publishedAt: n.publishedAt,
          url: n.url,
        })),
      };
    }

    case 'get_raises': {
      const raises = await fetchRecentRaises(30);
      let filtered = raises;
      if (params['category']) {
        const cat = String(params['category']).toLowerCase();
        filtered = filtered.filter(
          (r) => r.category?.toLowerCase().includes(cat) || r.sector?.toLowerCase().includes(cat),
        );
      }
      if (params['chain']) {
        const ch = String(params['chain']).toLowerCase();
        filtered = filtered.filter((r) => r.chains.some((c) => c.toLowerCase().includes(ch)));
      }
      return {
        raises: filtered.slice(0, 10).map((r) => ({
          name: r.name,
          round: r.round,
          amount: r.amount,
          chains: r.chains,
          sector: r.sector,
          category: r.category,
          leadInvestors: r.leadInvestors,
          date: new Date(r.date * 1000).toISOString().split('T')[0],
        })),
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// App component
// ---------------------------------------------------------------------------

function App(): React.JSX.Element {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [_inputHistory, setInputHistory] = useState<string[]>([]);
  const [initError, setInitError] = useState<string | null>(null);

  const { streamingText, isStreaming, activeTools, completedTools, sendMessage } = useAIStream();

  const { isExecuting, executeSlashCommand } = useCommand();

  // -----------------------------------------------------------------------
  // Initialisation: load config, set up AI client and tool handler
  // -----------------------------------------------------------------------
  useEffect(() => {
    try {
      const cfg = loadConfig();
      setConfig(cfg);
      setToolHandler(handleTool);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setInitError(`Initialisation failed: ${message}`);
    }
    // Ensure VIZZOR_TOOLS is referenced so the import is not tree-shaken.
    void VIZZOR_TOOLS;
  }, []);

  // -----------------------------------------------------------------------
  // When the AI stream finishes, capture the final message
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isStreaming && streamingText.length > 0 && isProcessing) {
      setMessages((prev) => [...prev, { role: 'assistant', content: streamingText }]);
      setIsProcessing(false);
    }
  }, [isStreaming, streamingText, isProcessing]);

  // -----------------------------------------------------------------------
  // Input handler
  // -----------------------------------------------------------------------
  const handleSubmit = useCallback(
    (input: string): void => {
      // Record in history
      setInputHistory((prev) => [...prev, input]);

      if (isSlashCommand(input)) {
        const { name } = parseCommand(input);

        // Special commands handled directly by the app
        if (name === 'clear') {
          setMessages([]);
          return;
        }
        if (name === 'exit') {
          process.exit(0);
        }

        // All other slash commands — fire-and-forget the async work
        setIsProcessing(true);
        executeSlashCommand(input)
          .then((result) => {
            if (result) {
              setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: result.text, blocks: result.blocks },
              ]);
            }
          })
          .catch(() => {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: 'Command execution failed.' },
            ]);
          })
          .finally(() => {
            setIsProcessing(false);
          });
        return;
      }

      // Regular message — send to AI
      setMessages((prev) => [...prev, { role: 'user', content: input }]);
      setIsProcessing(true);
      sendMessage(input);
    },
    [executeSlashCommand, sendMessage],
  );

  // -----------------------------------------------------------------------
  // Determine whether the input should be disabled
  // -----------------------------------------------------------------------
  const inputDisabled = isProcessing || isStreaming || isExecuting;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <Box flexDirection="column" paddingX={1}>
      <WelcomeBanner />

      {initError && (
        <Box marginTop={1}>
          <Box borderStyle="single" borderColor="red" paddingX={1}>
            <Text color="red">{initError}</Text>
          </Box>
        </Box>
      )}

      {messages.length > 0 && (
        <Box marginTop={1}>
          <MessageList messages={messages} />
        </Box>
      )}

      {/* Show streaming AI text while a response is being generated */}
      {isStreaming && streamingText.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Box>
            <StreamingText text={streamingText} isStreaming={isStreaming} />
          </Box>
        </Box>
      )}

      {/* Show active tool executions */}
      {(activeTools.length > 0 || completedTools.length > 0) && (
        <Box marginTop={1} flexDirection="column">
          {completedTools.map((tool) => (
            <ToolStatus key={`done-${tool}`} toolName={tool} isActive={false} />
          ))}
          {activeTools.map((tool) => (
            <ToolStatus key={`active-${tool}`} toolName={tool} isActive />
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <InputPrompt onSubmit={handleSubmit} disabled={inputDisabled} />
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Mount the Vizzor TUI using Ink's `render()` function.
 *
 * Call this from the CLI entry point to start the interactive terminal UI.
 */
export function startTUI(): void {
  render(<App />);
}
