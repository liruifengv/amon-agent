import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  Session,
  Message,
  AssistantMessage,
  AssistantContentBlock,
  ToolCallContentBlock,
  TokenUsage,
} from '../../shared/types';
import { AUTO_SAVE_INTERVAL_MS } from '../../shared/constants';
import { persistence, DEFAULT_WORKSPACE } from './persistence';
import * as configStore from './configStore';
import { createLogger } from './logger';
import mainI18n from '../i18n';

const log = createLogger('SessionStore');

/** 当前会话数据格式版本 */
const CURRENT_SESSION_VERSION = 2;

interface MessageState {
  sessionId: string;
  messageId: string;
  isStreaming: boolean;
  abortController?: AbortController;
}

class SessionStore extends EventEmitter {
  private static instance: SessionStore;

  // 内存中的会话数据
  private sessions: Map<string, Session> = new Map();
  // 当前活跃的消息处理
  private activeMessages: Map<string, MessageState> = new Map();
  // 脏数据标记（需要保存的会话）
  private dirtySessionIds: Set<string> = new Set();
  // 保存定时器
  private saveTimer: NodeJS.Timeout | null = null;
  // 节流定时器
  private throttleTimers: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {
    super();
    this.startAutoSave();
  }

  static getInstance(): SessionStore {
    if (!SessionStore.instance) {
      SessionStore.instance = new SessionStore();
    }
    return SessionStore.instance;
  }

  // ============ 会话管理 ============

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  getMessages(sessionId: string): Message[] {
    return this.sessions.get(sessionId)?.messages || [];
  }

  setSession(session: Session): void {
    this.sessions.set(session.id, session);
  }

  async createSession(name?: string, workspace?: string): Promise<Session> {
    // 如果没有指定工作空间，使用设置中的默认工作空间
    let resolvedWorkspace = workspace;
    if (!resolvedWorkspace) {
      try {
        const settings = await configStore.getSettings();
        const defaultWs = settings.workspaces?.find(w => w.isDefault);
        resolvedWorkspace = defaultWs?.path || DEFAULT_WORKSPACE;
      } catch {
        resolvedWorkspace = DEFAULT_WORKSPACE;
      }
    }

    const session: Session = {
      id: uuidv4(),
      name: name || mainI18n.t('common:defaultSessionName', { date: new Date().toLocaleString() }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      workspace: resolvedWorkspace,
      version: CURRENT_SESSION_VERSION,
    };

    log.info('Session created', { name: session.name, workspace: resolvedWorkspace }, session.id);

    this.sessions.set(session.id, session);
    await this.saveNow(session.id);
    this.emit('session:created', session);

    return session;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    log.info('Session deleted', undefined, sessionId);
    this.sessions.delete(sessionId);
    this.dirtySessionIds.delete(sessionId);
    this.activeMessages.delete(sessionId);

    const result = await persistence.deleteSession(sessionId);
    this.emit('session:deleted', sessionId);

    return result;
  }

  async renameSession(sessionId: string, newName: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    log.info('Session renamed', { oldName: session.name, newName }, sessionId);
    session.name = newName;
    session.updatedAt = new Date().toISOString();
    this.markDirty(sessionId);
    await this.saveNow(sessionId);

    this.emit('session:updated', session);
    return session;
  }

  async updateSessionWorkspace(sessionId: string, workspace: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // 如果 workspace 为空，使用默认工作空间
    session.workspace = workspace || DEFAULT_WORKSPACE;
    session.updatedAt = new Date().toISOString();
    this.markDirty(sessionId);
    await this.saveNow(sessionId);

    this.emit('session:updated', session);
    return session;
  }

  // ============ 消息管理 ============

  addMessage(sessionId: string, message: Message): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    log.debug('Message added', { role: message.role, messageId: message.id }, sessionId);
    session.messages.push(message);
    session.updatedAt = new Date().toISOString();
    this.markDirty(sessionId);

    // 通知渲染进程
    this.emit('messages:updated', sessionId, session.messages);
  }

  updateMessage(sessionId: string, messageId: string, updates: Partial<Message>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const message = session.messages.find(m => m.id === messageId);
    if (!message) return;

    Object.assign(message, updates);
    session.updatedAt = new Date().toISOString();
    this.markDirty(sessionId);

    this.emit('messages:updated', sessionId, session.messages);
  }

  /**
   * 替换助手消息的全部内容块（用于流式更新）
   * eventAdapter 每次 message_update 时调用，将 pi-ai 的内容块整体同步到 SessionStore
   */
  replaceAssistantContentBlocks(
    sessionId: string,
    messageId: string,
    contentBlocks: AssistantContentBlock[],
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const message = session.messages.find(m => m.id === messageId);
    if (!message || message.role !== 'assistant') return;

    (message as AssistantMessage).contentBlocks = contentBlocks;
    this.markDirty(sessionId);

    // 节流发送更新（流式时高频更新）
    this.throttledEmit('messages:updated', sessionId, session.messages);
  }

  /**
   * 更新指定工具调用的执行结果
   */
  updateToolCallResult(
    sessionId: string,
    messageId: string,
    toolCallId: string,
    updates: Partial<ToolCallContentBlock>,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const message = session.messages.find(m => m.id === messageId);
    if (!message || message.role !== 'assistant') return;

    const assistantMsg = message as AssistantMessage;
    const toolBlock = assistantMsg.contentBlocks.find(
      (b): b is ToolCallContentBlock => b.type === 'toolCall' && b.id === toolCallId
    );
    if (!toolBlock) {
      log.warn('updateToolCallResult: tool call not found', { messageId, toolCallId }, sessionId);
      return;
    }

    Object.assign(toolBlock, updates);
    this.markDirty(sessionId);
    this.emit('messages:updated', sessionId, session.messages);
  }

  /**
   * 更新助手消息的 usage 和完成状态
   */
  completeAssistantMessage(
    sessionId: string,
    messageId: string,
    usage: TokenUsage,
    stopReason: string,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const message = session.messages.find(m => m.id === messageId);
    if (!message || message.role !== 'assistant') return;

    const assistantMsg = message as AssistantMessage;
    assistantMsg.usage = usage;
    assistantMsg.stopReason = stopReason;
    assistantMsg.isStreaming = false;

    this.markDirty(sessionId);
    this.emit('messages:updated', sessionId, session.messages);
  }

  // ============ 消息状态管理 ============

  setMessageState(sessionId: string, state: MessageState): void {
    this.activeMessages.set(sessionId, state);
    this.emit('message:state', sessionId, { isLoading: state.isStreaming });
  }

  getMessageState(sessionId: string): MessageState | undefined {
    return this.activeMessages.get(sessionId);
  }

  clearMessageState(sessionId: string): void {
    this.activeMessages.delete(sessionId);
    this.emit('message:state', sessionId, { isLoading: false });
  }

  isSessionLoading(sessionId: string): boolean {
    return this.activeMessages.get(sessionId)?.isStreaming || false;
  }

  // 获取所有会话的加载状态
  getAllLoadingStates(): Record<string, boolean> {
    const states: Record<string, boolean> = {};
    this.activeMessages.forEach((state, sessionId) => {
      states[sessionId] = state.isStreaming;
    });
    return states;
  }

  // ============ 持久化 ============

  private markDirty(sessionId: string): void {
    this.dirtySessionIds.add(sessionId);
  }

  private startAutoSave(): void {
    // 定期检查并保存脏数据
    this.saveTimer = setInterval(() => {
      this.flushDirty();
    }, AUTO_SAVE_INTERVAL_MS);
  }

  async flushDirty(): Promise<void> {
    if (this.dirtySessionIds.size === 0) return;

    const sessionIds = Array.from(this.dirtySessionIds);
    this.dirtySessionIds.clear();

    log.debug('Flushing dirty sessions', { count: sessionIds.length });

    await Promise.all(
      sessionIds.map(async (id) => {
        const session = this.sessions.get(id);
        if (session) {
          await persistence.saveSession(session);
        }
      })
    );
  }

  // 立即保存指定会话
  async saveNow(sessionId: string): Promise<void> {
    this.dirtySessionIds.delete(sessionId);
    const session = this.sessions.get(sessionId);
    if (session) {
      await persistence.saveSession(session);
    }
  }

  // 加载所有会话到内存
  async loadAllSessions(): Promise<Session[]> {
    const sessions = await persistence.loadAllSessions();
    for (const s of sessions) {
      const valid = this.validateSession(s);
      if (valid) {
        this.sessions.set(s.id, valid);
      }
    }
    log.info('All sessions loaded', { count: this.sessions.size });
    return this.getAllSessions();
  }

  // 加载单个会话到内存（如果未加载）
  async ensureSessionLoaded(sessionId: string): Promise<Session | undefined> {
    let session = this.sessions.get(sessionId);
    if (!session) {
      const loaded = await persistence.loadSession(sessionId);
      if (loaded) {
        const valid = this.validateSession(loaded);
        if (valid) {
          session = valid;
          this.sessions.set(sessionId, session);
        }
      }
    }
    return session;
  }

  /**
   * 检查 session 版本是否兼容。
   * 不兼容的旧版本直接丢弃（返回 null）。
   */
  private validateSession(session: Session): Session | null {
    if (session.version === CURRENT_SESSION_VERSION) {
      return session;
    }
    log.info('Discarding incompatible session', {
      version: session.version,
    }, session.id);
    return null;
  }

  // 节流发送事件
  private throttledEmit(event: string, sessionId: string, data: unknown): void {
    const key = `${event}:${sessionId}`;

    if (this.throttleTimers.has(key)) return;

    this.emit(event, sessionId, data);

    this.throttleTimers.set(
      key,
      setTimeout(() => {
        this.throttleTimers.delete(key);
      }, 50) // 50ms 节流
    );
  }

  // 清理
  async shutdown(): Promise<void> {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }
    // 清理所有节流定时器
    this.throttleTimers.forEach(timer => clearTimeout(timer));
    this.throttleTimers.clear();

    await this.flushDirty();
  }
}

export const sessionStore = SessionStore.getInstance();
