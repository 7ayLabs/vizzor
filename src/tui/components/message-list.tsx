import React from 'react';
import { Box, Text, Newline } from 'ink';
import { RiskBar } from '../blocks/risk-bar.js';
import { TokenCard } from '../blocks/token-card.js';
import { HolderList } from '../blocks/holder-list.js';
import { MarketTicker } from '../blocks/market-ticker.js';
import { AuditResult } from '../blocks/audit-result.js';

export type RichBlock =
  | { type: 'risk'; data: { score: number; level: string; factors: string[] } }
  | { type: 'token'; data: { name: string; symbol: string; decimals: number; totalSupply: string } }
  | { type: 'holders'; data: { address: string; percentage: number }[] }
  | { type: 'market'; data: { symbol: string; price: number; change24h: number; volume: number } }
  | { type: 'audit'; data: { findings: { severity: string; description: string }[] } };

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  blocks?: RichBlock[];
}

interface MessageListProps {
  messages: Message[];
}

function RichBlockRenderer({ block }: { block: RichBlock }): React.JSX.Element | null {
  switch (block.type) {
    case 'risk':
      return (
        <RiskBar score={block.data.score} level={block.data.level} factors={block.data.factors} />
      );
    case 'token':
      return (
        <TokenCard
          name={block.data.name}
          symbol={block.data.symbol}
          decimals={block.data.decimals}
          totalSupply={block.data.totalSupply}
        />
      );
    case 'holders':
      return <HolderList holders={block.data} />;
    case 'market':
      return (
        <MarketTicker
          symbol={block.data.symbol}
          price={block.data.price}
          change24h={block.data.change24h}
          volume={block.data.volume}
        />
      );
    case 'audit':
      return <AuditResult findings={block.data.findings} />;
    default:
      return null;
  }
}

export function MessageList({ messages }: MessageListProps): React.JSX.Element {
  return (
    <Box flexDirection="column" gap={1}>
      {messages.map((msg, idx) => (
        <Box key={idx} flexDirection="column">
          {msg.role === 'user' ? (
            <Box>
              <Text bold color="#FFA500">
                You:{' '}
              </Text>
              <Text>{msg.content}</Text>
            </Box>
          ) : (
            <Box flexDirection="column">
              <Box>
                <Text bold color="blue">
                  Vizzor:{' '}
                </Text>
                <Text>{msg.content}</Text>
              </Box>
              {msg.blocks?.map((block, blockIdx) => (
                <Box key={blockIdx} marginTop={1}>
                  <RichBlockRenderer block={block} />
                </Box>
              ))}
            </Box>
          )}
          {idx < messages.length - 1 && <Newline />}
        </Box>
      ))}
    </Box>
  );
}
