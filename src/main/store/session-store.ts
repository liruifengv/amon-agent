import { EventEmitter } from 'events';
import type { CompactionSnapshot, Session, SessionMessage, SessionState } from '@shared/types';
import type { ApprovalMode } from '@shared/permission-types';
import { STREAM_THROTTLE_MS } from '@shared/constants';

function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: NodeJS.Timeout | null = null;
  let lastArgs: A | null = null;

  const throttled = (...args: A) => {
    lastArgs = args;
    if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        if (lastArgs) {
          fn(...lastArgs);
          lastArgs = null;
        }
      }, ms);
    }
  };

  return throttled;
}

export class SessionStore extends EventEmitter {
  private sessions = new Map<string, Session>();
  private messages = new Map<string, SessionMessage[]>();
  private compactionSnapshots = new Map<string, CompactionSnapshot>();

  private throttledMessagesEmit = throttle(
    (sessionId: string) => {
      const msgs = this.messages.get(sessionId);
      if (msgs) this.emit('messages:updated', sessionId, [...msgs]);
    },
    STREAM_THROTTLE_MS,
  );

  // ---- 会话管理 ----

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  createSession(session: Session): void {
    this.sessions.set(session.id, session);
    this.messages.set(session.id, []);
    this.emit('session:created', session);
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.messages.delete(sessionId);
    this.compactionSnapshots.delete(sessionId);
    this.emit('session:deleted', sessionId);
  }

  renameSession(sessionId: string, title: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.title = title;
    session.updatedAt = Date.now();
    this.emit('session:updated', session);
  }

  updateSessionWorkspace(sessionId: string, workspace: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.workspace = workspace;
    session.updatedAt = Date.now();
    this.emit('session:updated', session);
  }

  setSessionApprovalMode(sessionId: string, approvalMode: ApprovalMode): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.approvalMode = approvalMode;
    session.updatedAt = Date.now();
    this.emit('session:updated', session);
  }

  // ---- 消息管理 ----

  getMessages(sessionId: string): SessionMessage[] {
    return this.messages.get(sessionId) ?? [];
  }

  getCompactionSnapshot(sessionId: string): CompactionSnapshot | undefined {
    return this.compactionSnapshots.get(sessionId);
  }

  setCompactionSnapshot(sessionId: string, snapshot: CompactionSnapshot): void {
    this.compactionSnapshots.set(sessionId, snapshot);
  }

  addMessage(sessionId: string, message: SessionMessage): void {
    const msgs = this.messages.get(sessionId);
    if (!msgs) return;
    msgs.push(message);

    const session = this.sessions.get(sessionId);
    if (session) session.updatedAt = Date.now();

    this.emit('messages:updated', sessionId, [...msgs]);
  }

  /**
   * Update a message at a specific index (used for streaming updates).
   */
  updateMessageAt(sessionId: string, index: number, message: SessionMessage): void {
    const msgs = this.messages.get(sessionId);
    if (msgs && index >= 0 && index < msgs.length) {
      msgs[index] = message;
      this.throttledMessagesEmit(sessionId);
    }
  }

  // ---- 批量加载 ----

  loadSessionState(state: SessionState): void {
    this.sessions.set(state.session.id, state.session);
    this.messages.set(state.session.id, state.messages);
    if (state.compactionSnapshot) {
      this.compactionSnapshots.set(state.session.id, state.compactionSnapshot);
    } else {
      this.compactionSnapshots.delete(state.session.id);
    }
  }
}
