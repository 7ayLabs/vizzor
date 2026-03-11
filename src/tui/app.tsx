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
import { loadConfig } from '../config/loader.js';
import { setConfig, setToolHandler } from '../ai/client.js';
import { VIZZOR_TOOLS } from '../ai/tools.js';
import { getAdapter } from '../chains/registry.js';
import { analyzeWallet } from '../core/forensics/wallet-analyzer.js';
import { detectRugIndicators } from '../core/forensics/rug-detector.js';
import { fetchMarketData } from '../core/trends/market.js';
import { fetchUpcomingICOs } from '../core/scanner/ico-tracker.js';

// ---------------------------------------------------------------------------
// Tool handler — bridges Claude tool-use to Vizzor core modules
// ---------------------------------------------------------------------------

async function handleTool(name: string, input: unknown): Promise<unknown> {
  const params = input as Record<string, unknown>;

  switch (name) {
    case 'get_token_info': {
      const address = String(params['address'] ?? '');
      const chain = String(params['chain'] ?? 'ethereum');
      const adapter = getAdapter(chain);
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
      const chain = String(params['chain'] ?? 'ethereum');
      const adapter = getAdapter(chain);
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
      const chain = String(params['chain'] ?? 'ethereum');
      const adapter = getAdapter(chain);
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
      const projects = await fetchUpcomingICOs();
      return { projects };
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
