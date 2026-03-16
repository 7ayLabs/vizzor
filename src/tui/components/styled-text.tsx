// ---------------------------------------------------------------------------
// StyledText — renders AI response text with rich formatting:
//   - Section headers (======TITLE====== and # markdown) as styled lines
//   - $SYMBOL tags as inline colored tags
//   - **bold** inline rendering
//   - Strips raw dividers (===, ---)
// ---------------------------------------------------------------------------

import React from 'react';
import { Box, Text } from 'ink';
import { KNOWN_SYMBOLS } from '../../config/constants.js';

// ---------------------------------------------------------------------------
// Token icon/color map for $TAG rendering
// ---------------------------------------------------------------------------

const TOKEN_STYLES: Record<string, { icon: string; color: string }> = {
  BTC: { icon: '\u20BF', color: '#F7931A' },
  ETH: { icon: '\u039E', color: '#627EEA' },
  SOL: { icon: '\u25C9', color: '#9945FF' },
  BNB: { icon: '\u25C6', color: '#F3BA2F' },
  XRP: { icon: '\u25CB', color: '#00AAE4' },
  ADA: { icon: '\u25B2', color: '#0033AD' },
  DOGE: { icon: '\u00D0', color: '#C2A633' },
  DOT: { icon: '\u25CF', color: '#E6007A' },
  AVAX: { icon: '\u25B2', color: '#E84142' },
  MATIC: { icon: '\u2B23', color: '#8247E5' },
  LINK: { icon: '\u26D3', color: '#2A5ADA' },
  UNI: { icon: '\u2B22', color: '#FF007A' },
  ATOM: { icon: '\u2B50', color: '#6F7390' },
  NEAR: { icon: '\u25CE', color: '#00C1DE' },
  ARB: { icon: '\u25C6', color: '#28A0F0' },
  OP: { icon: '\u25CF', color: '#FF0420' },
  SUI: { icon: '\u25C8', color: '#4DA2FF' },
  APT: { icon: '\u25B3', color: '#2DD8A3' },
  PEPE: { icon: '\u2603', color: '#00B84D' },
  SHIB: { icon: '\u25CF', color: '#FFA409' },
};

function getTokenStyle(symbol: string): { icon: string; color: string } {
  const upper = symbol.toUpperCase();
  return TOKEN_STYLES[upper] ?? { icon: '\u25CF', color: '#888888' };
}

function isKnownSymbol(sym: string): boolean {
  const lower = sym.toLowerCase();
  return lower in KNOWN_SYMBOLS || sym.toUpperCase() in TOKEN_STYLES;
}

// ---------------------------------------------------------------------------
// Header color/icon by content
// ---------------------------------------------------------------------------

function getHeaderColor(title: string): string {
  const upper = title.toUpperCase();
  if (upper.includes('CONTEXTO') || upper.includes('CONTEXT')) return '#4A9EFF';
  if (
    upper.includes('ESCENARIO 1') ||
    upper.includes('BULL TRAP') ||
    upper.includes('BARRIDO ARRIBA')
  )
    return '#FF6B6B';
  if (
    upper.includes('ESCENARIO 2') ||
    upper.includes('BEAR TRAP') ||
    upper.includes('BARRIDO ABAJO')
  )
    return '#51CF66';
  if (upper.includes('ESCENARIO 3') || upper.includes('SHORT SQUEEZE')) return '#FF922B';
  if (upper.includes('ESCENARIO 4') || upper.includes('LONG SQUEEZE')) return '#CC5DE8';
  if (upper.includes('MANIPULACI') || upper.includes('MANIPULATION')) return '#FFD43B';
  if (upper.includes('ALERTA') || upper.includes('ALERT')) return '#FF0000';
  if (upper.includes('CONCLUSI') || upper.includes('CONCLUSION')) return '#20C997';
  if (upper.includes('MICROSTRUCTURE') || upper.includes('MICROESTRUCTURA')) return '#4A9EFF';
  if (upper.includes('PREDICCI') || upper.includes('PREDICTION') || upper.includes('FORECAST'))
    return '#FF922B';
  if (upper.includes('SCALP')) return '#CC5DE8';
  if (upper.includes('CORTO') || upper.includes('SHORT-TERM') || upper.includes('SHORT TERM'))
    return '#51CF66';
  if (upper.includes('MEDIANO') || upper.includes('MEDIUM')) return '#4A9EFF';
  if (upper.includes('LARGO') || upper.includes('LONG-TERM') || upper.includes('LONG TERM'))
    return '#FF922B';
  if (upper.includes('RIESGO') || upper.includes('RISK')) return '#FF6B6B';
  if (
    upper.includes('SOPORTE') ||
    upper.includes('SUPPORT') ||
    upper.includes('RESISTENCIA') ||
    upper.includes('RESISTANCE')
  )
    return '#FFD43B';
  return '#868E96';
}

function getHeaderIcon(title: string): string {
  const upper = title.toUpperCase();
  if (upper.includes('CONTEXTO') || upper.includes('CONTEXT')) return '\u25C8'; // ◈
  if (upper.includes('ESCENARIO 1') || upper.includes('BULL TRAP')) return '\u25B2'; // ▲
  if (upper.includes('ESCENARIO 2') || upper.includes('BEAR TRAP')) return '\u25BC'; // ▼
  if (upper.includes('ESCENARIO 3') || upper.includes('SHORT SQUEEZE')) return '\u26A1'; // ⚡
  if (upper.includes('ESCENARIO 4') || upper.includes('LONG SQUEEZE')) return '\u26A1'; // ⚡
  if (upper.includes('MANIPULACI') || upper.includes('MANIPULATION')) return '\u26A0'; // ⚠
  if (upper.includes('ALERTA') || upper.includes('ALERT')) return '\u2622'; // ☢
  if (upper.includes('CONCLUSI') || upper.includes('CONCLUSION')) return '\u2713'; // ✓
  if (upper.includes('PREDICCI') || upper.includes('PREDICTION') || upper.includes('FORECAST'))
    return '\u25C9'; // ◉
  if (upper.includes('RIESGO') || upper.includes('RISK')) return '\u25CF'; // ●
  return '\u25AA'; // ▪
}

// ---------------------------------------------------------------------------
// Line classification
// ---------------------------------------------------------------------------

interface ParsedLine {
  type: 'h1' | 'h2' | 'h3' | 'h4' | 'text' | 'divider' | 'empty';
  content: string;
}

/** Pure divider: all = or all - (at least 3 chars) */
const RE_EQ_DIVIDER = /^={3,}\s*$/;
const RE_DASH_DIVIDER = /^-{3,}\s*$/;
/** Inline = header: "=== TITLE ===" */
const RE_EQ_HEADER = /^={3,}\s*(.+?)\s*={3,}$/;
/** Markdown headers */
const RE_H1 = /^#\s+(.+)$/;
const RE_H2 = /^##\s+(.+)$/;
const RE_H3 = /^###\s+(.+)$/;
const RE_H4 = /^####\s+(.+)$/;

function classifyLines(text: string): ParsedLine[] {
  const rawLines = text.split('\n');
  const result: ParsedLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i] ?? '';
    const trimmed = line.trim();

    // Empty line
    if (trimmed === '') {
      result.push({ type: 'empty', content: '' });
      continue;
    }

    // Inline = header: "=== TITLE ==="
    const eqHeader = trimmed.match(RE_EQ_HEADER);
    if (eqHeader) {
      result.push({ type: 'h1', content: eqHeader[1] ?? trimmed });
      continue;
    }

    // Pure = divider: "=============================="
    if (RE_EQ_DIVIDER.test(trimmed)) {
      // Look-ahead: divider + title + divider
      const nextLine = rawLines[i + 1]?.trim();
      const afterNext = rawLines[i + 2]?.trim();
      if (nextLine && !RE_EQ_DIVIDER.test(nextLine) && afterNext && RE_EQ_DIVIDER.test(afterNext)) {
        result.push({ type: 'h1', content: nextLine });
        i += 2;
        continue;
      }
      // Standalone divider — drop
      result.push({ type: 'divider', content: '' });
      continue;
    }

    // Pure - divider: "---" / "------"
    if (RE_DASH_DIVIDER.test(trimmed)) {
      result.push({ type: 'divider', content: '' });
      continue;
    }

    // Markdown #### H4
    const h4 = trimmed.match(RE_H4);
    if (h4) {
      result.push({ type: 'h4', content: h4[1] ?? trimmed });
      continue;
    }
    // Markdown ### H3
    const h3 = trimmed.match(RE_H3);
    if (h3) {
      result.push({ type: 'h3', content: h3[1] ?? trimmed });
      continue;
    }
    // Markdown ## H2
    const h2 = trimmed.match(RE_H2);
    if (h2) {
      result.push({ type: 'h2', content: h2[1] ?? trimmed });
      continue;
    }
    // Markdown # H1
    const h1 = trimmed.match(RE_H1);
    if (h1) {
      result.push({ type: 'h1', content: h1[1] ?? trimmed });
      continue;
    }

    // Regular text
    result.push({ type: 'text', content: line });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Inline formatting: $SYMBOL tags + **bold**
// ---------------------------------------------------------------------------

interface TextSegment {
  type: 'text' | 'token' | 'bold';
  content: string;
  symbol?: string;
}

function parseInlineFormatting(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  // Match $SYMBOL or **bold**
  const regex = /\$([A-Za-z]{2,6})\b|\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      // $SYMBOL match
      const sym = match[1];
      if (isKnownSymbol(sym)) {
        segments.push({ type: 'token', content: match[0], symbol: sym.toUpperCase() });
      } else {
        segments.push({ type: 'text', content: match[0] });
      }
    } else if (match[2]) {
      // **bold** match
      segments.push({ type: 'bold', content: match[2] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: text }];
}

// ---------------------------------------------------------------------------
// Render components
// ---------------------------------------------------------------------------

function TokenTag({ symbol }: { symbol: string }): React.JSX.Element {
  const style = getTokenStyle(symbol);
  return (
    <Text color={style.color} bold>
      {style.icon}
      {symbol}
    </Text>
  );
}

function RichLine({ text }: { text: string }): React.JSX.Element {
  const segments = parseInlineFormatting(text);

  const first = segments[0];
  if (segments.length === 1 && first && first.type === 'text') {
    return <Text wrap="wrap">{text}</Text>;
  }

  return (
    <Text wrap="wrap">
      {segments.map((seg, i) => {
        if (seg.type === 'token' && seg.symbol) {
          return <TokenTag key={i} symbol={seg.symbol} />;
        }
        if (seg.type === 'bold') {
          return (
            <Text key={i} bold>
              {seg.content}
            </Text>
          );
        }
        return <Text key={i}>{seg.content}</Text>;
      })}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface StyledTextProps {
  text: string;
}

export function StyledText({ text }: StyledTextProps): React.JSX.Element {
  const lines = classifyLines(text);

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => {
        // H1 — bold, colored, with icon, top margin
        if (line.type === 'h1') {
          const color = getHeaderColor(line.content);
          const icon = getHeaderIcon(line.content);
          return (
            <Box key={i} marginTop={1}>
              <Text color={color} bold>
                {icon} {line.content}
              </Text>
            </Box>
          );
        }

        // H2 — bold, colored, no icon
        if (line.type === 'h2') {
          const color = getHeaderColor(line.content);
          return (
            <Box key={i} marginTop={1}>
              <Text color={color} bold>
                {line.content}
              </Text>
            </Box>
          );
        }

        // H3 — bold, dimmer color
        if (line.type === 'h3') {
          return (
            <Box key={i} marginTop={0}>
              <Text bold color="#CED4DA">
                {line.content}
              </Text>
            </Box>
          );
        }

        // H4 — bold only
        if (line.type === 'h4') {
          return (
            <Box key={i}>
              <Text bold>{line.content}</Text>
            </Box>
          );
        }

        // Dividers and empty lines — skip
        if (line.type === 'divider' || line.type === 'empty') {
          return null;
        }

        // Regular text with inline formatting
        return (
          <Box key={i}>
            <RichLine text={line.content} />
          </Box>
        );
      })}
    </Box>
  );
}
