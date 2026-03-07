import { promises as fs } from 'fs';
import path from 'path';
import type { Session, SessionState } from '@shared/types';
import type { Message } from '../../ai/types';
import { createLogger } from './logger';

const log = createLogger('Persistence');

// ==================== JSONL Record Types ====================

interface BaseRecord {
  ts: number;
}

interface SessionMetaRecord extends BaseRecord {
  type: 'session_meta';
  id: string;
  title: string;
  workspace: string;
  createdAt: number;
}

interface MessageRecord extends BaseRecord {
  type: 'message';
  message: Message;
}

interface MetaUpdateRecord extends BaseRecord {
  type: 'meta_update';
  updates: Partial<Pick<Session, 'title' | 'workspace'>>;
}

type SessionRecord = SessionMetaRecord | MessageRecord | MetaUpdateRecord;

// ==================== Persistence Class ====================

export class Persistence {
  private sessionsDir: string;

  constructor(sessionsDir: string) {
    this.sessionsDir = sessionsDir;
  }

  getPath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.jsonl`);
  }

  /**
   * Create a new session file with the initial meta record.
   */
  async createSession(session: Session): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });

    const record: SessionMetaRecord = {
      type: 'session_meta',
      id: session.id,
      title: session.title,
      workspace: session.workspace,
      createdAt: session.createdAt,
      ts: session.createdAt,
    };

    const line = JSON.stringify(record) + '\n';
    await fs.appendFile(this.getPath(session.id), line, 'utf-8');
    log.debug('Session created on disk', undefined, session.id);
  }

  /**
   * Append message records to the session file.
   */
  async appendMessages(sessionId: string, messages: Message[]): Promise<void> {
    if (messages.length === 0) return;

    const lines = messages
      .map((message) => {
        const record: MessageRecord = {
          type: 'message',
          message,
          ts: message.timestamp,
        };
        return JSON.stringify(record);
      })
      .join('\n') + '\n';

    await fs.appendFile(this.getPath(sessionId), lines, 'utf-8');
    log.debug('Messages appended', { count: messages.length }, sessionId);
  }

  /**
   * Append a meta update record (title/workspace changes).
   */
  async appendMetaUpdate(
    sessionId: string,
    updates: Partial<Pick<Session, 'title' | 'workspace'>>,
  ): Promise<void> {
    const record: MetaUpdateRecord = {
      type: 'meta_update',
      updates,
      ts: Date.now(),
    };

    const line = JSON.stringify(record) + '\n';
    await fs.appendFile(this.getPath(sessionId), line, 'utf-8');
    log.debug('Meta update appended', updates, sessionId);
  }

  /**
   * Rewrite session file with fresh messages (used after agent runs).
   * Preserves the session meta and replaces all messages.
   */
  async rewriteMessages(sessionId: string, messages: Message[]): Promise<void> {
    const filePath = this.getPath(sessionId);

    // Read existing meta
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      log.warn('Cannot rewrite: session file not found', undefined, sessionId);
      return;
    }

    const lines = content.split('\n').filter((line) => line.trim() !== '');
    if (lines.length === 0) return;

    // Keep session_meta and meta_update records
    const metaLines: string[] = [];
    for (const line of lines) {
      try {
        const record = JSON.parse(line) as SessionRecord;
        if (record.type === 'session_meta' || record.type === 'meta_update') {
          metaLines.push(line);
        }
      } catch {
        // skip malformed
      }
    }

    // Build new file content
    const messageParts = messages.map((message) => {
      const record: MessageRecord = {
        type: 'message',
        message,
        ts: message.timestamp,
      };
      return JSON.stringify(record);
    });

    const newContent = [...metaLines, ...messageParts].join('\n') + '\n';
    await fs.writeFile(filePath, newContent, 'utf-8');
    log.debug('Messages rewritten', { count: messages.length }, sessionId);
  }

  /**
   * Load a full session state by replaying all records.
   */
  async loadSession(sessionId: string): Promise<SessionState | null> {
    const filePath = this.getPath(sessionId);

    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      log.debug('Session file not found', undefined, sessionId);
      return null;
    }

    const lines = content.split('\n').filter((line) => line.trim() !== '');
    if (lines.length === 0) return null;

    let session: Session | null = null;
    const messages: Message[] = [];

    for (const line of lines) {
      try {
        const record = JSON.parse(line) as SessionRecord;

        switch (record.type) {
          case 'session_meta':
            session = {
              id: record.id,
              title: record.title,
              workspace: record.workspace,
              createdAt: record.createdAt,
              updatedAt: record.ts,
            };
            break;

          case 'message': {
            // Validate that message has a known role
            const msg = record.message;
            if (msg && (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'toolResult')) {
              messages.push(msg);
              if (session) {
                session.updatedAt = record.ts;
              }
            }
            break;
          }

          case 'meta_update':
            if (session) {
              if (record.updates.title !== undefined) {
                session.title = record.updates.title;
              }
              if (record.updates.workspace !== undefined) {
                session.workspace = record.updates.workspace;
              }
              session.updatedAt = record.ts;
            }
            break;
        }
      } catch {
        log.warn('Failed to parse JSONL line, skipping', undefined, sessionId);
      }
    }

    if (!session) return null;

    log.debug('Session loaded', { messageCount: messages.length }, sessionId);
    return { session, messages };
  }

  /**
   * Load metadata for all sessions.
   */
  async loadAllSessionMetas(): Promise<Session[]> {
    await fs.mkdir(this.sessionsDir, { recursive: true });

    let files: string[];
    try {
      files = await fs.readdir(this.sessionsDir);
    } catch {
      return [];
    }

    const sessions: Session[] = [];

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;

      try {
        const content = await fs.readFile(
          path.join(this.sessionsDir, file),
          'utf-8',
        );
        const lines = content.split('\n').filter((line) => line.trim() !== '');
        if (lines.length === 0) continue;

        // First line must be session_meta
        const firstRecord = JSON.parse(lines[0]) as SessionRecord;
        if (firstRecord.type !== 'session_meta') continue;

        const session: Session = {
          id: firstRecord.id,
          title: firstRecord.title,
          workspace: firstRecord.workspace,
          createdAt: firstRecord.createdAt,
          updatedAt: firstRecord.ts,
        };

        // Scan remaining lines for meta_update and track latest ts
        for (let i = 1; i < lines.length; i++) {
          try {
            const record = JSON.parse(lines[i]) as SessionRecord;
            if (record.type === 'meta_update') {
              if (record.updates.title !== undefined) {
                session.title = record.updates.title;
              }
              if (record.updates.workspace !== undefined) {
                session.workspace = record.updates.workspace;
              }
            }
            if (record.ts > session.updatedAt) {
              session.updatedAt = record.ts;
            }
          } catch {
            // Skip malformed lines
          }
        }

        sessions.push(session);
      } catch {
        // Skip unreadable files
      }
    }

    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Delete a session file.
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      await fs.unlink(this.getPath(sessionId));
      log.debug('Session deleted from disk', undefined, sessionId);
    } catch {
      log.warn('Failed to delete session file', undefined, sessionId);
    }
  }
}
