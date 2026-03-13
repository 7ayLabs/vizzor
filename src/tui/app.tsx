// ---------------------------------------------------------------------------
// Vizzor TUI — Root Ink application component
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useCallback } from 'react';
import { render, Box, Text, Static } from 'ink';
import { StatusBar } from './components/status-bar.js';
import { PriceTicker } from './components/price-ticker.js';
import { WelcomeBanner } from './components/welcome-banner.js';
import { MessageBubble } from './components/message-bubble.js';
import { CommandHints } from './components/command-hints.js';
import { ToolStatusList } from './components/tool-status.js';
import { InputPrompt } from './components/input-prompt.js';
import { StreamingText } from './components/streaming-text.js';
import type { Message } from './components/message-list.js';
import { useAIStream } from './hooks/use-ai-stream.js';
import { useCommand } from './hooks/use-command.js';
import { usePriceTicker } from './hooks/use-price-ticker.js';
import { isSlashCommand, parseCommand } from './commands.js';
import { loadConfig, getConfig } from '../config/loader.js';
import { DEFAULT_CHAIN, CHAIN_REGISTRY, KNOWN_SYMBOLS } from '../config/constants.js';
import { setConfig, setToolHandler, getProvider } from '../ai/client.js';
import { VIZZOR_TOOLS } from '../ai/tools.js';
import { getAdapter } from '../chains/registry.js';
import {
  isValidSymbol,
  fetchTickerPrice,
  fetchFundingRate,
  fetchOpenInterest,
} from '../data/sources/binance.js';
import { checkTokenSecurity } from '../data/sources/goplus.js';
import { fetchFearGreedIndex } from '../data/sources/fear-greed.js';
import { analyzeWallet } from '../core/forensics/wallet-analyzer.js';
import { detectRugIndicators } from '../core/forensics/rug-detector.js';
import { fetchMarketData, fetchTokenFromDex, fetchTrendingTokens } from '../core/trends/market.js';
import { fetchUpcomingICOs, searchICOs } from '../core/scanner/ico-tracker.js';
import { fetchCryptoNews } from '../data/sources/cryptopanic.js';
import { fetchRecentRaises } from '../data/sources/defillama.js';
import {
  createAgent,
  listAgents,
  getAgentByName,
  getAgentStatus,
  getRecentDecisions,
} from '../core/agent/index.js';

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
      // Try Binance first (reliable, no rate limits), enrich with CoinGecko
      try {
        const binance = await fetchTickerPrice(symbol);
        const gecko = await fetchMarketData(symbol).catch(() => null);
        return {
          symbol: binance.symbol,
          name: gecko?.name ?? binance.symbol,
          price: binance.price,
          priceChange24h: binance.change24h,
          priceChange7d: gecko?.priceChange7d ?? null,
          volume24h: gecko?.volume24h ?? null,
          marketCap: gecko?.marketCap ?? null,
          rank: gecko?.rank ?? null,
          source: 'binance+coingecko',
        };
      } catch {
        // Fallback to CoinGecko only
        const data = await fetchMarketData(symbol);
        if (!data) {
          return { error: `No market data found for "${symbol}"` };
        }
        return data;
      }
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

    case 'get_token_security': {
      const address = String(params['address'] ?? '');
      const chain = String(params['chain'] ?? 'ethereum');
      const security = await checkTokenSecurity(address, chain);
      if (!security) {
        return { error: `No security data for ${address} on ${chain}` };
      }
      return {
        contractAddress: security.contractAddress,
        chain: security.chain,
        riskLevel: security.riskLevel,
        isHoneypot: security.isHoneypot,
        isMintable: security.isMintable,
        buyTax: security.buyTax,
        sellTax: security.sellTax,
        isOpenSource: security.isOpenSource,
        isProxy: security.isProxy,
        hiddenOwner: security.hiddenOwner,
        cannotBuy: security.cannotBuy,
        cannotSellAll: security.cannotSellAll,
        isBlacklisted: security.isBlacklisted,
        holderCount: security.holderCount,
        lpHolderCount: security.lpHolderCount,
        creatorPercent: security.creatorPercent,
        ownerPercent: security.ownerPercent,
        trustList: security.trustList,
      };
    }

    case 'get_fear_greed': {
      const data = await fetchFearGreedIndex(7);
      return {
        current: { value: data.current.value, classification: data.current.classification },
        previous: data.previous
          ? { value: data.previous.value, classification: data.previous.classification }
          : null,
        history: data.history.map((h) => ({
          value: h.value,
          classification: h.classification,
          date: new Date(h.timestamp * 1000).toISOString().split('T')[0],
        })),
      };
    }

    case 'get_derivatives_data': {
      const symbol = String(params['symbol'] ?? 'BTC');
      const [fundingResult, oiResult] = await Promise.allSettled([
        fetchFundingRate(symbol),
        fetchOpenInterest(symbol),
      ]);

      const result: Record<string, unknown> = { symbol: symbol.toUpperCase() };
      if (fundingResult.status === 'fulfilled') {
        result['fundingRate'] = fundingResult.value.fundingRate;
        result['fundingRatePct'] = `${(fundingResult.value.fundingRate * 100).toFixed(4)}%`;
        result['markPrice'] = fundingResult.value.markPrice;
      }
      if (oiResult.status === 'fulfilled') {
        result['openInterest'] = oiResult.value.openInterest;
        result['openInterestNotional'] = oiResult.value.notionalValue;
      }
      return result;
    }

    case 'create_agent': {
      const agentName = String(params['name'] ?? '');
      const strategy = String(params['strategy'] ?? 'momentum');
      const pairsRaw = String(params['pairs'] ?? 'BTC,ETH');
      const interval = params['interval'] ? Number(params['interval']) : 60;
      const pairs = pairsRaw.split(',').map((p) => p.trim().toUpperCase());
      const agent = createAgent(agentName, strategy, pairs, interval);
      return {
        id: agent.id,
        name: agent.name,
        strategy: agent.strategy,
        pairs: agent.pairs,
        interval: agent.interval,
        message: `Agent "${agent.name}" created. Use /agent start ${agent.name} to activate.`,
      };
    }

    case 'list_agents': {
      const agents = listAgents();
      return {
        agents: agents.map((a) => {
          const status = getAgentStatus(a.id);
          return {
            name: a.name,
            strategy: a.strategy,
            pairs: a.pairs,
            interval: a.interval,
            status: status?.status ?? 'idle',
            cycleCount: status?.cycleCount ?? 0,
          };
        }),
      };
    }

    case 'get_agent_status': {
      const agentName = String(params['name'] ?? '');
      const agent = getAgentByName(agentName);
      if (!agent) return { error: `Agent "${agentName}" not found` };
      const state = getAgentStatus(agent.id);
      if (!state) return { error: `Agent "${agentName}" not found` };
      const decisions = getRecentDecisions(agent.id, 5);
      return {
        name: state.config.name,
        status: state.status,
        strategy: state.config.strategy,
        pairs: state.config.pairs,
        cycleCount: state.cycleCount,
        error: state.error,
        recentDecisions: decisions.map((d) => ({
          symbol: d.symbol,
          action: d.decision.action,
          confidence: d.decision.confidence,
          reasoning: d.decision.reasoning,
          timestamp: new Date(d.timestamp).toISOString(),
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
  const [initError, setInitError] = useState<string | null>(null);
  const [showBanner, setShowBanner] = useState(true);
  const [currentInput, setCurrentInput] = useState('');
  const [clearEpoch, setClearEpoch] = useState(0);
  const [providerName, setProviderName] = useState('ollama');
  const [chainName, setChainName] = useState(DEFAULT_CHAIN);

  const { streamingText, isStreaming, activeTools, completedTools, sendMessage } = useAIStream();
  const { isExecuting, executeSlashCommand } = useCommand();
  const ticker = usePriceTicker();

  // -----------------------------------------------------------------------
  // Initialisation: load config, set up AI client and tool handler
  // -----------------------------------------------------------------------
  useEffect(() => {
    try {
      const cfg = loadConfig();
      setConfig(cfg);
      setToolHandler(handleTool);
      setProviderName(cfg.ai?.provider ?? 'ollama');
      setChainName(cfg.defaultChain ?? DEFAULT_CHAIN);
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
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: streamingText, timestamp: new Date() },
      ]);
      setIsProcessing(false);
    }
  }, [isStreaming, streamingText, isProcessing]);

  // -----------------------------------------------------------------------
  // Input handler
  // -----------------------------------------------------------------------
  const handleSubmit = useCallback(
    (input: string): void => {
      // Hide banner after first interaction
      if (showBanner) setShowBanner(false);

      if (isSlashCommand(input)) {
        const { name, args } = parseCommand(input);

        // Special commands handled directly by the app
        if (name === 'clear') {
          setMessages([]);
          setClearEpoch((prev) => prev + 1);
          return;
        }
        if (name === 'exit') {
          process.exit(0);
        }

        // /add <symbol> — add a crypto to the price ticker
        if (name === 'add') {
          const sym = args[0]?.toUpperCase();
          if (!sym) {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: 'Usage: /add <symbol>  (e.g. /add DOGE)',
                timestamp: new Date(),
              },
            ]);
            return;
          }
          const geckoId = KNOWN_SYMBOLS[sym.toLowerCase()] ?? sym.toLowerCase();
          setIsProcessing(true);
          isValidSymbol(sym)
            .then((valid) => {
              if (valid) {
                ticker.addSymbol(geckoId, sym);
                setMessages((prev) => [
                  ...prev,
                  {
                    role: 'assistant',
                    content: `Added ${sym} to price ticker.`,
                    timestamp: new Date(),
                  },
                ]);
              } else {
                setMessages((prev) => [
                  ...prev,
                  {
                    role: 'assistant',
                    content: `Symbol "${sym}" not found on Binance.`,
                    timestamp: new Date(),
                  },
                ]);
              }
            })
            .catch(() => {
              setMessages((prev) => [
                ...prev,
                {
                  role: 'assistant',
                  content: `Failed to validate symbol "${sym}".`,
                  timestamp: new Date(),
                },
              ]);
            })
            .finally(() => setIsProcessing(false));
          return;
        }

        // /remove <symbol> — remove a crypto from the price ticker
        if (name === 'remove') {
          const sym = args[0]?.toUpperCase();
          if (!sym) {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: 'Usage: /remove <symbol>', timestamp: new Date() },
            ]);
            return;
          }
          const geckoId = KNOWN_SYMBOLS[sym.toLowerCase()] ?? sym.toLowerCase();
          ticker.removeSymbol(geckoId);
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `Removed ${sym} from price ticker.`,
              timestamp: new Date(),
            },
          ]);
          return;
        }

        // /chain [chainId] — switch or list chains
        if (name === 'chain') {
          const target = args[0]?.toLowerCase();
          if (!target) {
            const lines = CHAIN_REGISTRY.map(
              (c) => `  ${c.icon} ${c.name} (${c.id})${c.id === chainName ? ' *' : ''}`,
            );
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: `Available chains:\n${lines.join('\n')}\n\nUsage: /chain <id>`,
                timestamp: new Date(),
              },
            ]);
            return;
          }
          const meta = CHAIN_REGISTRY.find((c) => c.id === target);
          if (!meta) {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: `Unknown chain "${target}". Available: ${CHAIN_REGISTRY.map((c) => c.id).join(', ')}`,
                timestamp: new Date(),
              },
            ]);
            return;
          }
          setChainName(meta.id);
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `${meta.icon} Switched to ${meta.name}.`,
              timestamp: new Date(),
            },
          ]);
          return;
        }

        // All other slash commands — fire-and-forget the async work
        setIsProcessing(true);
        executeSlashCommand(input)
          .then((result) => {
            if (result) {
              setMessages((prev) => [
                ...prev,
                {
                  role: 'assistant',
                  content: result.text,
                  blocks: result.blocks,
                  timestamp: new Date(),
                },
              ]);
            }
            // Update status bar when provider changes
            if (name === 'provider') {
              try {
                setProviderName(getProvider().name);
              } catch {
                /* no active provider */
              }
            }
          })
          .catch(() => {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: 'Command execution failed.', timestamp: new Date() },
            ]);
          })
          .finally(() => {
            setIsProcessing(false);
          });
        return;
      }

      // Regular message — send to AI
      setMessages((prev) => [...prev, { role: 'user', content: input, timestamp: new Date() }]);
      setIsProcessing(true);
      sendMessage(input);
    },
    [executeSlashCommand, sendMessage, showBanner],
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
      {/* Status bar */}
      <StatusBar provider={providerName} chain={chainName} connected />

      {/* Live price ticker */}
      <PriceTicker ticker={ticker} onAddPress={undefined} />

      {/* Compact banner — hides after first message */}
      {showBanner && <WelcomeBanner />}

      {initError && (
        <Box marginTop={1}>
          <Box borderStyle="single" borderColor="red" paddingX={1}>
            <Text color="red">{initError}</Text>
          </Box>
        </Box>
      )}

      {/* Message history — uses Static so items render once */}
      <Static key={clearEpoch} items={messages}>
        {(msg, idx) => (
          <Box key={`${clearEpoch}-${idx}`} marginTop={idx === 0 ? 1 : 0}>
            <MessageBubble message={msg} />
          </Box>
        )}
      </Static>

      {/* Show streaming AI text while a response is being generated */}
      {isStreaming && streamingText.length > 0 && (
        <Box marginTop={1}>
          <StreamingText text={streamingText} isStreaming={isStreaming} />
        </Box>
      )}

      {/* Show active tool executions */}
      <ToolStatusList active={activeTools} completed={completedTools} />

      {/* Command hints when typing / */}
      {currentInput.startsWith('/') && <CommandHints filter={currentInput} />}

      {/* Input bar */}
      <Box marginTop={1}>
        <InputPrompt
          onSubmit={handleSubmit}
          disabled={inputDisabled}
          onInputChange={setCurrentInput}
        />
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
