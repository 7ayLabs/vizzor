// ---------------------------------------------------------------------------
// Conversation context manager for chat mode
// ---------------------------------------------------------------------------

import type Anthropic from '@anthropic-ai/sdk';

/**
 * Manages a rolling conversation history for multi-turn chat sessions.
 *
 * Messages are stored in the format expected by the Anthropic Messages API
 * so they can be passed directly to `client.messages.create()`.
 */
export class ConversationContext {
  private messages: Anthropic.Messages.MessageParam[] = [];

  /** Append a user message to the conversation history. */
  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content });
  }

  /** Append an assistant message to the conversation history. */
  addAssistantMessage(content: string): void {
    this.messages.push({ role: 'assistant', content });
  }

  /** Return the full message history (read-only snapshot). */
  getMessages(): Anthropic.Messages.MessageParam[] {
    return [...this.messages];
  }

  /** Clear the entire conversation history. */
  clear(): void {
    this.messages = [];
  }

  /**
   * Rough trim that keeps the conversation under an approximate token budget
   * by dropping the oldest messages first.
   *
   * The heuristic assumes ~4 characters per token (conservative for English
   * text). This is intentionally imprecise — the Anthropic API will reject
   * requests that truly exceed the context window, so this just keeps us in
   * the right ballpark.
   *
   * @param maxTokens - Approximate token budget for the conversation history.
   */
  trimToMaxTokens(maxTokens: number): void {
    const charsPerToken = 4;
    const maxChars = maxTokens * charsPerToken;

    // Walk backwards, accumulating character count, and find the cut point.
    let totalChars = 0;
    let cutIndex = this.messages.length;

    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      const length =
        typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length;

      totalChars += length;

      if (totalChars > maxChars) {
        cutIndex = i + 1;
        break;
      }

      // If we've walked all the way back and we're still within budget,
      // keep everything.
      if (i === 0) {
        cutIndex = 0;
      }
    }

    if (cutIndex > 0) {
      this.messages = this.messages.slice(cutIndex);
    }
  }
}
