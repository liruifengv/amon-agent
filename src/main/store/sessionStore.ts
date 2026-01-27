import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Session, Message, MessageContentBlock, ToolCall, ToolCallStatus, TextContentBlock, ThinkingContentBlock } from '../../shared/types';
import { AUTO_SAVE_INTERVAL_MS } from '../../shared/constants';
import { persistence, DEFAULT_WORKSPACE } from './persistence';
import * as configStore from './configStore';
import { createLogger } from './logger';
import { generateBlockId } from '../agent/streamState';

const log = createLogger('SessionStore');

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
      name: name || `新会话 ${new Date().toLocaleString('zh-CN')}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      workspace: resolvedWorkspace,
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

  appendToMessage(
    sessionId: string,
    messageId: string,
    blockType: 'text' | 'thinking',
    content: string
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const message = session.messages.find(m => m.id === messageId);
    if (!message) return;

    const blocks = message.contentBlocks || [];
    const lastBlock = blocks[blocks.length - 1];

    // 兼容旧逻辑：如果最后一个 block 是同类型且没有 id，则追加
    if (lastBlock && lastBlock.type === blockType && (lastBlock.type === 'text' || lastBlock.type === 'thinking')) {
      lastBlock.content += content;
    } else {
      // 创建新 block（带 ID）
      const newBlock: MessageContentBlock = blockType === 'text'
        ? { type: 'text', id: generateBlockId(), content, isComplete: false } as TextContentBlock
        : { type: 'thinking', id: generateBlockId(), content, isComplete: false } as ThinkingContentBlock;
      blocks.push(newBlock);
      message.contentBlocks = blocks;
    }

    this.markDirty(sessionId);

    // 节流发送更新（流式时高频更新）
    this.throttledEmit('messages:updated', sessionId, session.messages);
  }

  addToolCallToMessage(sessionId: string, messageId: string, toolCall: ToolCall): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const message = session.messages.find(m => m.id === messageId);
    if (!message) return;

    const blocks = message.contentBlocks || [];
    const newBlock: MessageContentBlock = { type: 'tool_call', toolCall };
    blocks.push(newBlock);
    message.contentBlocks = blocks;

    this.markDirty(sessionId);
    this.emit('messages:updated', sessionId, session.messages);
  }

  /**
   * 更新工具调用的状态
   */
  updateToolCallStatus(sessionId: string, messageId: string, toolId: string, status: ToolCallStatus): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const message = session.messages.find(m => m.id === messageId);
    if (!message || !message.contentBlocks) return;

    const toolBlock = message.contentBlocks.find(
      b => b.type === 'tool_call' && b.toolCall.id === toolId
    );
    if (!toolBlock || toolBlock.type !== 'tool_call') return;

    toolBlock.toolCall.status = status;
    this.markDirty(sessionId);
    this.emit('messages:updated', sessionId, session.messages);
  }

  /**
   * 更新工具调用的输出结果
   */
  updateToolCallResult(sessionId: string, toolId: string, output: string, isError?: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      log.warn('updateToolCallResult: session not found', { sessionId, toolId });
      return;
    }

    // 遍历所有消息找到对应的工具调用
    for (const message of session.messages) {
      if (!message.contentBlocks) continue;

      const toolBlock = message.contentBlocks.find(
        b => b.type === 'tool_call' && b.toolCall.id === toolId
      );
      if (toolBlock && toolBlock.type === 'tool_call') {
        log.info('Updating tool call result', { toolId, isError, outputLength: output.length }, sessionId);
        toolBlock.toolCall.output = output;
        toolBlock.toolCall.status = isError ? 'error' : 'completed';
        toolBlock.toolCall.isError = isError;
        this.markDirty(sessionId);
        this.emit('messages:updated', sessionId, session.messages);
        return;
      }
    }

    // 如果没找到，记录警告
    log.warn('updateToolCallResult: tool call not found', { sessionId, toolId });
  }

  /**
   * 添加内容块到指定消息（带 ID）
   */
  addContentBlock(sessionId: string, messageId: string, block: MessageContentBlock): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const message = session.messages.find(m => m.id === messageId);
    if (!message) return;

    const blocks = message.contentBlocks || [];
    blocks.push(block);
    message.contentBlocks = blocks;

    this.markDirty(sessionId);
    this.throttledEmit('messages:updated', sessionId, session.messages);
  }

  /**
   * 更新指定 ID 的内容块
   */
  updateContentBlock(
    sessionId: string,
    messageId: string,
    blockId: string,
    updates: Partial<{ content: string; isComplete: boolean }>
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const message = session.messages.find(m => m.id === messageId);
    if (!message?.contentBlocks) return;

    const block = message.contentBlocks.find(
      b => (b.type === 'text' || b.type === 'thinking') && b.id === blockId
    );
    if (!block || (block.type !== 'text' && block.type !== 'thinking')) return;

    if (updates.content !== undefined) {
      block.content = updates.content;
    }
    if (updates.isComplete !== undefined) {
      block.isComplete = updates.isComplete;
    }

    this.markDirty(sessionId);
    this.throttledEmit('messages:updated', sessionId, session.messages);
  }

  /**
   * 更新工具调用的输入缓冲（流式输入）
   */
  updateToolCallInputBuffer(sessionId: string, toolId: string, inputBuffer: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    for (const message of session.messages) {
      if (!message.contentBlocks) continue;

      const toolBlock = message.contentBlocks.find(
        b => b.type === 'tool_call' && b.toolCall.id === toolId
      );
      if (toolBlock && toolBlock.type === 'tool_call') {
        toolBlock.toolCall.inputBuffer = inputBuffer;
        this.markDirty(sessionId);
        this.throttledEmit('messages:updated', sessionId, session.messages);
        return;
      }
    }
  }

  /**
   * 更新工具调用的完整输入
   */
  updateToolCallInput(sessionId: string, toolId: string, input: Record<string, unknown>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    for (const message of session.messages) {
      if (!message.contentBlocks) continue;

      const toolBlock = message.contentBlocks.find(
        b => b.type === 'tool_call' && b.toolCall.id === toolId
      );
      if (toolBlock && toolBlock.type === 'tool_call') {
        toolBlock.toolCall.input = input;
        // 清空输入缓冲
        toolBlock.toolCall.inputBuffer = undefined;
        this.markDirty(sessionId);
        this.emit('messages:updated', sessionId, session.messages);
        return;
      }
    }
  }

  /**
   * 查找工具调用
   */
  findToolCall(sessionId: string, toolId: string): ToolCall | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    for (const message of session.messages) {
      if (!message.contentBlocks) continue;
      for (const block of message.contentBlocks) {
        if (block.type === 'tool_call' && block.toolCall.id === toolId) {
          return block.toolCall;
        }
      }
    }
    return undefined;
  }

  /**
   * 获取指定工具的子工具调用
   */
  getChildToolCalls(sessionId: string, parentToolId: string): ToolCall[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const children: ToolCall[] = [];
    for (const message of session.messages) {
      if (!message.contentBlocks) continue;
      for (const block of message.contentBlocks) {
        if (
          block.type === 'tool_call' &&
          block.toolCall.parentToolUseId === parentToolId
        ) {
          children.push(block.toolCall);
        }
      }
    }
    return children;
  }

  /**
   * 添加内容块到当前活跃的 assistant 消息
   * 用于在消息流中插入权限结果、用户问题回答等
   */
  addContentBlockToActiveMessage(sessionId: string, block: MessageContentBlock): void {
    const messageState = this.activeMessages.get(sessionId);
    if (!messageState) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const message = session.messages.find(m => m.id === messageState.messageId);
    if (!message) return;

    const blocks = message.contentBlocks || [];
    blocks.push(block);
    message.contentBlocks = blocks;

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

  // ============ SDK Session ID 管理 ============

  updateSdkSessionId(sessionId: string, sdkSessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.sdkSessionId = sdkSessionId;
    this.markDirty(sessionId);
    this.emit('session:sdkSessionId', sessionId, sdkSessionId);
  }

  getSdkSessionId(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.sdkSessionId;
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
    sessions.forEach(s => this.sessions.set(s.id, s));
    log.info('All sessions loaded', { count: sessions.length });
    return sessions;
  }

  // 加载单个会话到内存（如果未加载）
  async ensureSessionLoaded(sessionId: string): Promise<Session | undefined> {
    let session = this.sessions.get(sessionId);
    if (!session) {
      const loaded = await persistence.loadSession(sessionId);
      if (loaded) {
        this.sessions.set(sessionId, loaded);
        session = loaded;
      }
    }
    return session;
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
