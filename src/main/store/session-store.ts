import { EventEmitter } from 'events';
import type {
  Session,
  SessionState,
  Message,
  AssistantMessage,
  ContentBlock,
  TokenUsage,
  StopReason,
} from '@shared/types';
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
  private messages = new Map<string, Message[]>();

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

  // ---- 消息管理 ----

  getMessages(sessionId: string): Message[] {
    return this.messages.get(sessionId) ?? [];
  }

  addMessage(sessionId: string, message: Message): void {
    const msgs = this.messages.get(sessionId);
    if (!msgs) return;
    msgs.push(message);

    const session = this.sessions.get(sessionId);
    if (session) session.updatedAt = Date.now();

    this.emit('messages:updated', sessionId, [...msgs]);
  }

  setContentBlocks(sessionId: string, messageId: string, blocks: ContentBlock[]): void {
    const msgs = this.messages.get(sessionId);
    if (!msgs) return;
    const msg = msgs.find(m => m.id === messageId);
    if (msg && msg.role === 'assistant') {
      (msg as AssistantMessage).content = blocks;
      this.throttledMessagesEmit(sessionId);
    }
  }

  appendContentBlock(sessionId: string, messageId: string, block: ContentBlock): void {
    const msgs = this.messages.get(sessionId);
    if (!msgs) return;
    const msg = msgs.find(m => m.id === messageId);
    if (msg && msg.role === 'assistant') {
      (msg as AssistantMessage).content.push(block);
      this.emit('messages:updated', sessionId, [...msgs]);
    }
  }

  updateMessageUsage(sessionId: string, messageId: string, usage: TokenUsage): void {
    const msgs = this.messages.get(sessionId);
    if (!msgs) return;
    const msg = msgs.find(m => m.id === messageId);
    if (msg && msg.role === 'assistant') {
      const existing = (msg as AssistantMessage).usage;
      if (existing) {
        // 累加多轮 turn 的 token 用量
        existing.inputTokens += usage.inputTokens;
        existing.outputTokens += usage.outputTokens;
        existing.cacheReadTokens += usage.cacheReadTokens;
        existing.cacheWriteTokens += usage.cacheWriteTokens;
      } else {
        (msg as AssistantMessage).usage = { ...usage };
      }
    }
  }

  updateMessageStopReason(sessionId: string, messageId: string, stopReason: StopReason): void {
    const msgs = this.messages.get(sessionId);
    if (!msgs) return;
    const msg = msgs.find(m => m.id === messageId);
    if (msg && msg.role === 'assistant') {
      (msg as AssistantMessage).stopReason = stopReason;
    }
  }

  // ---- 批量加载 ----

  loadSessionState(state: SessionState): void {
    this.sessions.set(state.session.id, state.session);
    this.messages.set(state.session.id, state.messages);
  }
}
