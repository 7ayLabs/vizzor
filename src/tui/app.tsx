// ---------------------------------------------------------------------------
// Vizzor TUI — Root Ink application component
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useCallback } from 'react';
import { render, Box, Text, Static, useInput } from 'ink';
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
import { loadConfig } from '../config/loader.js';
import { DEFAULT_CHAIN, CHAIN_REGISTRY, KNOWN_SYMBOLS } from '../config/constants.js';
import { setConfig, setToolHandler, getProvider } from '../ai/client.js';
import { handleTool } from '../ai/tool-handler.js';
import { VIZZOR_TOOLS } from '../ai/tools.js';
import { isValidSymbol } from '../data/sources/binance.js';

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
  const [tickerFocused, setTickerFocused] = useState(false);

  const { streamingText, isStreaming, activeTools, completedTools, sendMessage, clearHistory } =
    useAIStream();
  const { isExecuting, executeSlashCommand } = useCommand();
  const ticker = usePriceTicker();

  // -----------------------------------------------------------------------
  // Ticker keyboard navigation (Tab to focus, arrows to navigate, Enter to analyze)
  // -----------------------------------------------------------------------
  useInput(
    (input, key) => {
      if (key.tab) {
        if (tickerFocused) {
          setTickerFocused(false);
          ticker.clearSelection();
        } else {
          setTickerFocused(true);
        }
        return;
      }
      if (!tickerFocused) return;
      if (key.rightArrow) {
        ticker.selectNext();
      } else if (key.leftArrow) {
        ticker.selectPrev();
      } else if (key.return) {
        const selected = ticker.getSelected();
        if (selected && !isProcessing && !isStreaming) {
          setTickerFocused(false);
          ticker.clearSelection();
          const msg = `Analyze ${selected.symbol} with full prediction`;
          setMessages((prev) => [...prev, { role: 'user', content: msg, timestamp: new Date() }]);
          setIsProcessing(true);
          sendMessage(msg);
        }
      } else if (key.escape || input === 'q') {
        setTickerFocused(false);
        ticker.clearSelection();
      }
    },
    { isActive: true },
  );

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
          clearHistory();
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
    [clearHistory, executeSlashCommand, sendMessage, showBanner],
  );

  // -----------------------------------------------------------------------
  // Determine whether the input should be disabled
  // -----------------------------------------------------------------------
  const inputDisabled = isProcessing || isStreaming || isExecuting || tickerFocused;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Status bar */}
      <StatusBar provider={providerName} chain={chainName} connected />

      {/* Live price ticker — Tab to focus, arrows to navigate, Enter to analyze */}
      <PriceTicker ticker={ticker} focused={tickerFocused} onAddPress={undefined} />

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
