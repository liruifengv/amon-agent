import { type ImageContent } from '@mariozechner/pi-ai';
import { v4 as uuidv4 } from 'uuid';
import type {
  UserMessage,
  AssistantMessage,
  ImageAttachment,
  MessageParams,
} from '../../shared/types';
import { getSettings } from '../store/configStore';
import { sessionStore } from '../store/sessionStore';
import { DEFAULT_WORKSPACE } from '../store/persistence';
import { createEventAdapter } from './eventAdapter';
import {
  expandTildePath,
  getOrCreateAgent,
  getAgent,
  restoreAgentContext,
  deleteSessionAgent,
  cleanupAllAgents,
} from './agentCache';
import { createLogger } from '../store/logger';

const log = createLogger('AgentService');

// 重导出供外部消费者使用
export { deleteSessionAgent, cleanupAllAgents };

// ==================== 消息管理 ====================

/**
 * 设置会话标题（使用第一条用户消息）
 */
function setTitleFromFirstMessage(sessionId: string, prompt: string): void {
  const session = sessionStore.getSession(sessionId);
  if (!session || session.messages.filter(m => m.role === 'user').length > 1) return;

  const title = prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt;
  sessionStore.renameSession(sessionId, title);
}

/**
 * 初始化查询消息：创建用户消息和助手消息占位符
 */
function initializeMessages(sessionId: string, prompt: string, images?: ImageAttachment[]): string {
  // 添加用户消息
  const userMessage: UserMessage = {
    id: uuidv4(),
    role: 'user',
    content: prompt,
    images,
    timestamp: Date.now(),
  };
  sessionStore.addMessage(sessionId, userMessage);

  // 设置会话标题
  setTitleFromFirstMessage(sessionId, prompt);

  // 创建助手消息占位符
  const assistantMessageId = uuidv4();
  const assistantMessage: AssistantMessage = {
    id: assistantMessageId,
    role: 'assistant',
    contentBlocks: [],
    isStreaming: true,
    timestamp: Date.now(),
  };
  sessionStore.addMessage(sessionId, assistantMessage);

  return assistantMessageId;
}

// ==================== 主入口 ====================

/**
 * 发送消息到 Agent
 */
export async function sendMessage(params: MessageParams): Promise<void> {
  const { prompt, sessionId, images } = params;

  log.info('Message started', {
    promptLength: prompt.length,
    imageCount: images?.length ?? 0,
  }, sessionId);

  // 中断已有消息处理
  const existingAgent = getAgent(sessionId);
  if (existingAgent?.state.isStreaming) {
    log.info('Interrupting existing message', undefined, sessionId);
    await interruptMessage(sessionId);
  }

  // 加载配置
  const settings = await getSettings();
  const agentSettings = settings.agent;

  // 获取会话的工作空间
  const session = sessionStore.getSession(sessionId);
  const workspace = expandTildePath(session?.workspace || DEFAULT_WORKSPACE);

  // 获取或创建 Agent
  const agent = getOrCreateAgent(sessionId, agentSettings, workspace);

  // 如果 Agent 消息列表为空但 Session 有历史消息，恢复上下文
  if (agent.state.messages.length === 0 && session && session.messages.length > 0) {
    const existingMessages = session.messages.filter(
      m => m.role === 'user' || (m.role === 'assistant' && !m.isStreaming)
    );
    if (existingMessages.length > 0) {
      log.info('Restoring session context', { messageCount: existingMessages.length }, sessionId);
      restoreAgentContext(agent, existingMessages);
    }
  }

  // 初始化消息（添加用户消息和助手占位符到 SessionStore）
  const assistantMessageId = initializeMessages(sessionId, prompt, images);

  // 设置消息状态
  sessionStore.setMessageState(sessionId, {
    sessionId,
    messageId: assistantMessageId,
    isStreaming: true,
  });

  // 订阅事件
  const adapter = createEventAdapter(sessionId, assistantMessageId);
  const unsubscribe = agent.subscribe(adapter);

  try {
    // 构建 pi-ai 格式的用户消息并调用 agent.prompt
    if (images && images.length > 0) {
      const piImages: ImageContent[] = images.map(img => ({
        type: 'image' as const,
        data: img.base64Data,
        mimeType: img.mimeType,
      }));
      await agent.prompt(prompt || '', piImages);
    } else {
      await agent.prompt(prompt);
    }

    log.info('Message completed successfully', undefined, sessionId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('Message failed', errorMessage, sessionId);

    // 更新助手消息的错误状态
    sessionStore.updateMessage(sessionId, assistantMessageId, {
      isStreaming: false,
      errorMessage,
    } as Partial<AssistantMessage>);

    sessionStore.emit('message:error', sessionId, errorMessage);
  } finally {
    unsubscribe();
    sessionStore.clearMessageState(sessionId);
    await sessionStore.saveNow(sessionId);
    log.debug('Message state cleared', undefined, sessionId);
  }
}

// ==================== 消息控制 ====================

/**
 * 中断指定会话的消息处理
 */
export async function interruptMessage(sessionId: string): Promise<void> {
  log.info('Interrupt requested', undefined, sessionId);

  const agent = getAgent(sessionId);
  if (agent) {
    agent.abort();
    // 等待 Agent 完成中止
    try {
      await agent.waitForIdle();
    } catch {
      // 忽略中止错误
    }
  }

  // 更新消息状态
  const messageState = sessionStore.getMessageState(sessionId);
  if (messageState?.messageId) {
    sessionStore.updateMessage(sessionId, messageState.messageId, {
      isStreaming: false,
    } as Partial<AssistantMessage>);
    await sessionStore.saveNow(sessionId);
  }

  sessionStore.clearMessageState(sessionId);
  log.info('Message interrupted', undefined, sessionId);
}

/**
 * 检查指定会话是否有活跃的消息处理
 */
export function hasActiveMessage(sessionId: string): boolean {
  const agent = getAgent(sessionId);
  return agent?.state.isStreaming || false;
}
