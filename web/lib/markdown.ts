/**
 * Lightweight markdown→HTML renderer for Vizzor chat bubbles.
 * Supports: bold, inline code, code blocks, bullet/numbered lists, links,
 * headers (#–####), ======HEADER====== sections, $SYMBOL crypto tags,
 * tables, divider stripping, and LaTeX artifact cleanup.
 */

const SAFE_URL_PROTOCOL = /^https?:\/\/|^mailto:/i;

// ---------------------------------------------------------------------------
// Token icon/color map for $TAG rendering (mirrors TUI styled-text.tsx)
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

// Section header color mapping (same logic as TUI)
function getSectionColor(title: string): string {
  const u = title.toUpperCase();
  if (u.includes('CONTEXTO') || u.includes('CONTEXT')) return '#4A9EFF';
  if (u.includes('ESCENARIO 1') || u.includes('BULL TRAP') || u.includes('BARRIDO ARRIBA'))
    return '#FF6B6B';
  if (u.includes('ESCENARIO 2') || u.includes('BEAR TRAP') || u.includes('BARRIDO ABAJO'))
    return '#51CF66';
  if (u.includes('ESCENARIO 3') || u.includes('SHORT SQUEEZE')) return '#FF922B';
  if (u.includes('ESCENARIO 4') || u.includes('LONG SQUEEZE')) return '#CC5DE8';
  if (u.includes('MANIPULACI') || u.includes('MANIPULATION')) return '#FFD43B';
  if (u.includes('ALERTA') || u.includes('ALERT')) return '#FF4444';
  if (u.includes('CONCLUSI') || u.includes('CONCLUSION')) return '#20C997';
  if (u.includes('PREDICCI') || u.includes('PREDICTION') || u.includes('FORECAST'))
    return '#FF922B';
  if (u.includes('RIESGO') || u.includes('RISK')) return '#FF6B6B';
  if (
    u.includes('SOPORTE') ||
    u.includes('SUPPORT') ||
    u.includes('RESISTENCIA') ||
    u.includes('RESISTANCE')
  )
    return '#FFD43B';
  return '#868E96';
}

function getSectionIcon(title: string): string {
  const u = title.toUpperCase();
  if (u.includes('CONTEXTO') || u.includes('CONTEXT')) return '\u25C8';
  if (u.includes('ESCENARIO 1') || u.includes('BULL TRAP')) return '\u25B2';
  if (u.includes('ESCENARIO 2') || u.includes('BEAR TRAP')) return '\u25BC';
  if (u.includes('ESCENARIO 3') || u.includes('SHORT SQUEEZE')) return '\u26A1';
  if (u.includes('ESCENARIO 4') || u.includes('LONG SQUEEZE')) return '\u26A1';
  if (u.includes('MANIPULACI') || u.includes('MANIPULATION')) return '\u26A0';
  if (u.includes('ALERTA') || u.includes('ALERT')) return '\u26A0';
  if (u.includes('CONCLUSI') || u.includes('CONCLUSION')) return '\u2713';
  if (u.includes('PREDICCI') || u.includes('PREDICTION')) return '\u25C9';
  if (u.includes('RIESGO') || u.includes('RISK')) return '\u25CF';
  return '\u25AA';
}

// ---------------------------------------------------------------------------
// Pre-processing: clean up model artifacts before rendering
// ---------------------------------------------------------------------------

const RE_EQ_DIVIDER = /^={3,}\s*$/;
const RE_DASH_DIVIDER = /^-{3,}\s*$/;
const RE_EQ_HEADER = /^={3,}\s*(.+?)\s*={3,}$/;
const RE_END_MARKER = /^---\s*END\s*---/i;

/** Strip LaTeX artifacts that local models sometimes generate */
function stripLatex(text: string): string {
  let s = text;
  // Remove \text{...}, \mathrm{...}, \mathbf{...}, \underline{...}, \underbar{...}, \color{...}{...}
  s = s.replace(/\\(?:text|mathrm|mathbf|underline|underbar)\s*\{([^}]*)\}/g, '$1');
  s = s.replace(/\\color\{[^}]*\}\{([^}]*)\}/g, '$1');
  // Remove standalone \[ \] \( \) — LaTeX display/inline math delimiters
  s = s.replace(/\\\[|\\\]|\\\(|\\\)/g, '');
  // Remove ~\...{} patterns
  s = s.replace(/~\\[a-z]+\{[^}]*\}/gi, '');
  // Remove $\$NUMBER — just keep $NUMBER
  s = s.replace(/\$\\\$/g, '$');
  // Remove stray backslashes before common chars
  s = s.replace(/\\([,;!\\])/g, '$1');
  return s;
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

export function renderMarkdown(text: string): string {
  // Pre-process: strip LaTeX artifacts
  const cleaned = stripLatex(text);

  // Code blocks (```...```) — extract before line processing
  const codeBlocks: string[] = [];
  const withPlaceholders = cleaned.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre class="chat-code-block"><code${lang ? ` class="language-${escapeAttr(lang)}"` : ''}>${escapeHtml(code.trim())}</code></pre>`,
    );
    return `__CODEBLOCK__${idx}__`;
  });

  const lines = withPlaceholders.split('\n');
  const result: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    // Code block placeholder
    if (trimmed.startsWith('__CODEBLOCK__')) {
      if (inList) {
        result.push(inList === 'ul' ? '</ul>' : '</ol>');
        inList = null;
      }
      if (inTable) {
        result.push('</tbody></table></div>');
        inTable = false;
      }
      const idx = parseInt(trimmed.replace(/__CODEBLOCK__(\d+)__/, '$1'), 10);
      result.push(codeBlocks[idx] ?? '');
      continue;
    }

    // --- END --- marker — stop rendering
    if (RE_END_MARKER.test(trimmed)) break;

    // Empty line
    if (trimmed === '') {
      if (inList) {
        result.push(inList === 'ul' ? '</ul>' : '</ol>');
        inList = null;
      }
      if (inTable) {
        result.push('</tbody></table></div>');
        inTable = false;
      }
      continue;
    }

    // Inline ===HEADER=== (e.g. "=== CONTEXTO GENERAL ===")
    const eqHeader = trimmed.match(RE_EQ_HEADER);
    if (eqHeader?.[1]) {
      if (inList) {
        result.push(inList === 'ul' ? '</ul>' : '</ol>');
        inList = null;
      }
      if (inTable) {
        result.push('</tbody></table></div>');
        inTable = false;
      }
      const title = eqHeader[1];
      const color = getSectionColor(title);
      const icon = getSectionIcon(title);
      result.push(
        `<div class="chat-section-header" style="--section-color: ${color}"><span class="chat-section-icon">${icon}</span> ${escapeHtml(title)}</div>`,
      );
      continue;
    }

    // Pure ====== divider — check if it wraps a title (divider + title + divider)
    if (RE_EQ_DIVIDER.test(trimmed)) {
      const nextLine = lines[i + 1]?.trim();
      const afterNext = lines[i + 2]?.trim();
      if (nextLine && !RE_EQ_DIVIDER.test(nextLine) && afterNext && RE_EQ_DIVIDER.test(afterNext)) {
        if (inList) {
          result.push(inList === 'ul' ? '</ul>' : '</ol>');
          inList = null;
        }
        if (inTable) {
          result.push('</tbody></table></div>');
          inTable = false;
        }
        const title = nextLine;
        const color = getSectionColor(title);
        const icon = getSectionIcon(title);
        result.push(
          `<div class="chat-section-header" style="--section-color: ${color}"><span class="chat-section-icon">${icon}</span> ${escapeHtml(title)}</div>`,
        );
        i += 2;
        continue;
      }
      // Standalone divider — skip
      continue;
    }

    // Pure --- divider
    if (RE_DASH_DIVIDER.test(trimmed)) continue;

    // Table separator row (|--|--|) — skip
    if (/^\|[\s-:|]+\|$/.test(trimmed)) {
      continue;
    }

    // Table row (| col | col |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      if (!inTable) {
        if (inList) {
          result.push(inList === 'ul' ? '</ul>' : '</ol>');
          inList = null;
        }
        result.push('<div class="chat-table-wrap"><table class="chat-table"><tbody>');
        inTable = true;
      }
      result.push('<tr>' + cells.map((c) => `<td>${inlineFormat(c)}</td>`).join('') + '</tr>');
      continue;
    }

    // Close table if next line is not a table
    if (inTable) {
      result.push('</tbody></table></div>');
      inTable = false;
    }

    // Bullet list
    const bulletMatch = line.match(/^[\s]*[-*•]\s+(.+)/);
    if (bulletMatch?.[1]) {
      if (inList !== 'ul') {
        if (inList) result.push('</ol>');
        result.push('<ul>');
        inList = 'ul';
      }
      result.push(`<li>${inlineFormat(bulletMatch[1])}</li>`);
      continue;
    }

    // Numbered list
    const numMatch = line.match(/^[\s]*\d+[.)]\s+(.+)/);
    if (numMatch?.[1]) {
      if (inList !== 'ol') {
        if (inList) result.push('</ul>');
        result.push('<ol>');
        inList = 'ol';
      }
      result.push(`<li>${inlineFormat(numMatch[1])}</li>`);
      continue;
    }

    // Close list
    if (inList) {
      result.push(inList === 'ul' ? '</ul>' : '</ol>');
      inList = null;
    }

    // Headers (# – ####)
    const headerMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headerMatch?.[1] && headerMatch[2]) {
      const level = headerMatch[1].length;
      const content = headerMatch[2];
      if (level <= 2) {
        const color = getSectionColor(content);
        const icon = level === 1 ? getSectionIcon(content) + ' ' : '';
        result.push(
          `<h${level} class="chat-h${level}" style="--section-color: ${color}">${icon}${inlineFormat(content)}</h${level}>`,
        );
      } else {
        result.push(`<h${level} class="chat-h${level}">${inlineFormat(content)}</h${level}>`);
      }
      continue;
    }

    // Regular text
    result.push(`<p>${inlineFormat(trimmed)}</p>`);
  }

  if (inList) result.push(inList === 'ul' ? '</ul>' : '</ol>');
  if (inTable) result.push('</tbody></table></div>');

  return result.join('');
}

// ---------------------------------------------------------------------------
// Inline formatting
// ---------------------------------------------------------------------------

function inlineFormat(text: string): string {
  let safe = escapeHtml(text);

  // $SYMBOL crypto tags — must come before other $ handling
  safe = safe.replace(/\$([A-Za-z]{2,6})\b/g, (_, sym) => {
    const upper = sym.toUpperCase();
    const style = TOKEN_STYLES[upper];
    if (style) {
      return `<span class="chat-token-tag" style="--token-color: ${style.color}"><span class="chat-token-icon">${style.icon}</span>${upper}</span>`;
    }
    return `$${sym}`;
  });

  // Bold: **text**
  safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Inline code: `code`
  safe = safe.replace(/`(.+?)`/g, '<code class="chat-inline-code">$1</code>');

  // Links: [label](url)
  safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const decodedUrl = decodeURIComponent(url);
    if (!SAFE_URL_PROTOCOL.test(decodedUrl)) return label;
    return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  return safe;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
