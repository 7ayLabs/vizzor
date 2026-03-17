// ---------------------------------------------------------------------------
// Conversation persistence — SQLite storage for chat history
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { getDb } from './cache.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('data:conversations');
let tableInitialized = false;

function ensureTables(): void {
  if (tableInitialized) return;
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      token_data TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conv_messages_conv_id
      ON conversation_messages (conversation_id, timestamp ASC)
  `);

  tableInitialized = true;
  log.debug('Conversation tables initialized');
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

export function createConversation(title: string): string {
  ensureTables();
  const id = randomUUID();
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO conversations (id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(id, title, now, now);
  return id;
}

export function addMessage(
  conversationId: string,
  msg: {
    role: string;
    content: string;
    toolCalls?: unknown[];
    tokenData?: unknown[];
  },
): string {
  ensureTables();
  const id = randomUUID();
  const now = Date.now();

  getDb()
    .prepare(
      `INSERT INTO conversation_messages (id, conversation_id, role, content, tool_calls, token_data, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      conversationId,
      msg.role,
      msg.content,
      msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
      msg.tokenData ? JSON.stringify(msg.tokenData) : null,
      now,
    );

  // Update the conversation's updated_at timestamp
  getDb().prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);

  return id;
}

export function getConversations(): {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: number;
}[] {
  ensureTables();
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.title, c.updated_at,
              COUNT(cm.id) as message_count
       FROM conversations c
       LEFT JOIN conversation_messages cm ON cm.conversation_id = c.id
       GROUP BY c.id
       ORDER BY c.updated_at DESC`,
    )
    .all() as {
    id: string;
    title: string;
    updated_at: number;
    message_count: number;
  }[];

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    messageCount: r.message_count,
    updatedAt: r.updated_at,
  }));
}

export function getConversation(id: string): {
  id: string;
  title: string;
  messages: {
    id: string;
    role: string;
    content: string;
    toolCalls: unknown[] | null;
    tokenData: unknown[] | null;
    timestamp: number;
  }[];
} | null {
  ensureTables();

  const conv = getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
    | { id: string; title: string; created_at: number; updated_at: number }
    | undefined;

  if (!conv) return null;

  const rows = getDb()
    .prepare(
      `SELECT id, role, content, tool_calls, token_data, timestamp
       FROM conversation_messages
       WHERE conversation_id = ?
       ORDER BY timestamp ASC`,
    )
    .all(id) as {
    id: string;
    role: string;
    content: string;
    tool_calls: string | null;
    token_data: string | null;
    timestamp: number;
  }[];

  return {
    id: conv.id,
    title: conv.title,
    messages: rows.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      toolCalls: r.tool_calls ? (JSON.parse(r.tool_calls) as unknown[]) : null,
      tokenData: r.token_data ? (JSON.parse(r.token_data) as unknown[]) : null,
      timestamp: r.timestamp,
    })),
  };
}

export function deleteConversation(id: string): void {
  ensureTables();
  const db = getDb();
  db.prepare('DELETE FROM conversation_messages WHERE conversation_id = ?').run(id);
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
}

export function updateConversationTitle(id: string, title: string): void {
  ensureTables();
  getDb()
    .prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?')
    .run(title, Date.now(), id);
}
