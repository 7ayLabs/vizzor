/**
 * Lightweight markdown→HTML renderer for chat bubbles.
 * Supports: bold, inline code, code blocks, bullet/numbered lists, links, line breaks.
 */
export function renderMarkdown(text: string): string {
  // Code blocks (```...```)
  const html = text.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, lang, code) =>
      `<pre class="chat-code-block"><code${lang ? ` class="language-${lang}"` : ''}>${escapeHtml(code.trim())}</code></pre>`,
  );

  // Process line by line for lists and paragraphs
  const lines = html.split('\n');
  const result: string[] = [];
  let inList: 'ul' | 'ol' | null = null;

  for (const line of lines) {
    // Skip if inside a pre block (already handled)
    if (line.includes('<pre') || line.includes('</pre>')) {
      if (inList) {
        result.push(inList === 'ul' ? '</ul>' : '</ol>');
        inList = null;
      }
      result.push(line);
      continue;
    }

    // Bullet list
    const bulletMatch = line.match(/^[\s]*[-*]\s+(.+)/);
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
    const numMatch = line.match(/^[\s]*\d+\.\s+(.+)/);
    if (numMatch?.[1]) {
      if (inList !== 'ol') {
        if (inList) result.push('</ul>');
        result.push('<ol>');
        inList = 'ol';
      }
      result.push(`<li>${inlineFormat(numMatch[1])}</li>`);
      continue;
    }

    // Close any open list
    if (inList) {
      result.push(inList === 'ul' ? '</ul>' : '</ol>');
      inList = null;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headerMatch?.[1] && headerMatch[2]) {
      const level = headerMatch[1].length;
      result.push(`<h${level} class="chat-h${level}">${inlineFormat(headerMatch[2])}</h${level}>`);
      continue;
    }

    // Empty line = paragraph break
    if (line.trim() === '') {
      result.push('<br/>');
      continue;
    }

    // Regular text
    result.push(`<p>${inlineFormat(line)}</p>`);
  }

  if (inList) {
    result.push(inList === 'ul' ? '</ul>' : '</ol>');
  }

  return result.join('');
}

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code class="chat-inline-code">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
      const safeUrl = url.replace(/"/g, '&quot;');
      return `<a href="${safeUrl}" target="_blank" rel="noopener">${label}</a>`;
    });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
