import { SDKMessage, ContentBlock, StreamEvent, ToolCall } from '../../shared/types';
import { sessionStore } from '../store/sessionStore';
import { createLogger } from '../store/logger';

const log = createLogger('MessageHandler');

/**
 * 消息处理上下文
 */
export interface MessageContext {
  sessionId: string;
  messageId: string;
}

/**
 * 处理结果类型
 */
export interface HandleResult {
  type: 'continue' | 'complete' | 'error';
  data?: ResultData;
}

export interface ResultData {
  success: boolean;
  result?: string;
  cost?: number;
  duration?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  errors?: string[];
}

/**
 * 处理 SDK 消息的主入口
 */
export function handleMessage(sdkMessage: SDKMessage, ctx: MessageContext): HandleResult {
  const { sessionId } = ctx;

  switch (sdkMessage.type) {
    case 'assistant':
      log.debug('Received assistant message', undefined, sessionId);
      return handleAssistantMessage(sdkMessage, ctx);

    case 'user':
      return handleUserMessage(sdkMessage, ctx);

    case 'stream_event':
      return handleStreamEvent(sdkMessage, ctx);

    case 'system':
      return handleSystemMessage(sdkMessage, ctx);

    case 'result':
      log.debug('Received result message', { subtype: sdkMessage.subtype }, sessionId);
      return handleResultMessage(sdkMessage, ctx);

    default:
      log.warn('Unknown SDKMessage type', { type: (sdkMessage as { type: string }).type }, sessionId);
      return { type: 'continue' };
  }
}

/**
 * 处理 assistant 消息
 * 包含完整的消息内容，用于补全流式传输可能遗漏的部分
 */
function handleAssistantMessage(sdkMessage: SDKMessage, ctx: MessageContext): HandleResult {
  const { sessionId, messageId } = ctx;

  if (!sdkMessage.message?.content) {
    return { type: 'continue' };
  }

  const content = sdkMessage.message.content as ContentBlock[];
  const currentMessages = sessionStore.getMessages(sessionId);
  const currentMessage = currentMessages.find(m => m.id === messageId);

  // 获取已存在的工具调用 ID（用于去重）
  const existingToolIds = new Set(
    currentMessage?.contentBlocks
      ?.filter(b => b.type === 'tool_call')
      .map(b => b.toolCall.id) || []
  );

  // 计算当前已有的文本和思考内容长度（用于补全）
  const existingTextLength = currentMessage?.contentBlocks
    ?.filter(b => b.type === 'text')
    .reduce((sum, b) => sum + b.content.length, 0) || 0;

  const existingThinkingLength = currentMessage?.contentBlocks
    ?.filter(b => b.type === 'thinking')
    .reduce((sum, b) => sum + b.content.length, 0) || 0;

  // 处理各内容块
  for (const block of content) {
    switch (block.type) {
      case 'tool_use':
        // 处理工具调用（去重）
        if (!existingToolIds.has(block.id)) {
          const toolCall: ToolCall = {
            id: block.id,
            name: block.name,
            input: block.input,
          };
          log.info('Tool call received', { toolName: block.name, toolId: block.id }, sessionId);
          sessionStore.addToolCallToMessage(sessionId, messageId, toolCall);
        }
        break;

      case 'text':
        // 补全流式传输遗漏的文本
        if (block.text && existingTextLength < block.text.length) {
          const missingText = block.text.slice(existingTextLength);
          if (missingText) {
            sessionStore.appendToMessage(sessionId, messageId, 'text', missingText);
          }
        }
        break;

      case 'thinking':
        // 补全流式传输遗漏的思考内容
        if (block.thinking && existingThinkingLength < block.thinking.length) {
          const missingThinking = block.thinking.slice(existingThinkingLength);
          if (missingThinking) {
            sessionStore.appendToMessage(sessionId, messageId, 'thinking', missingThinking);
          }
        }
        break;
    }
  }

  return { type: 'continue' };
}

/**
 * 处理 user 消息
 * 通常由客户端添加，SDK 返回的可忽略
 */
function handleUserMessage(_sdkMessage: SDKMessage, _ctx: MessageContext): HandleResult {
  // 用户消息由客户端添加，SDK 返回的用户消息通常可忽略
  void _sdkMessage;
  void _ctx;
  return { type: 'continue' };
}

/**
 * 处理流式事件
 * 实时更新消息内容（文本/思考增量）
 */
function handleStreamEvent(sdkMessage: SDKMessage, ctx: MessageContext): HandleResult {
  const { sessionId, messageId } = ctx;
  const event = sdkMessage.event;

  if (!event) {
    return { type: 'continue' };
  }

  // 处理内容块增量
  if (event.type === 'content_block_delta' && event.delta) {
    handleContentBlockDelta(sessionId, messageId, event);
  }

  // 可扩展：处理其他流式事件类型
  // if (event.type === 'content_block_start') { ... }
  // if (event.type === 'content_block_stop') { ... }

  return { type: 'continue' };
}

/**
 * 处理内容块增量
 */
function handleContentBlockDelta(sessionId: string, messageId: string, event: StreamEvent): void {
  const delta = event.delta;
  if (!delta) return;

  switch (delta.type) {
    case 'text_delta':
      if (delta.text) {
        sessionStore.appendToMessage(sessionId, messageId, 'text', delta.text);
      }
      break;

    case 'thinking_delta':
      if (delta.thinking) {
        sessionStore.appendToMessage(sessionId, messageId, 'thinking', delta.thinking);
      }
      break;

    // 可扩展：处理其他增量类型
    // case 'input_json_delta':
    //   handleInputJsonDelta(delta);
    //   break;
  }
}

/**
 * 处理 system 消息
 * 系统级消息，通常用于日志或调试
 */
function handleSystemMessage(sdkMessage: SDKMessage, _ctx: MessageContext): HandleResult {
  // 系统消息通常用于日志或调试
  void _ctx;
  log.debug('System message received', sdkMessage);
  return { type: 'continue' };
}

/**
 * 处理 result 消息
 * 查询完成，包含最终结果和统计信息
 */
function handleResultMessage(sdkMessage: SDKMessage, ctx: MessageContext): HandleResult {
  const { sessionId, messageId } = ctx;

  // 提取 usage 数据
  const usage = sdkMessage.usage;

  // 更新消息完成状态
  sessionStore.updateMessage(sessionId, messageId, {
    isStreaming: false,
    tokenUsage: usage ? {
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      cacheReadInputTokens: usage.cache_read_input_tokens,
      cacheCreationInputTokens: usage.cache_creation_input_tokens,
      cost: sdkMessage.total_cost_usd,
      duration: sdkMessage.duration_ms,
    } : undefined,
  });

  // 返回完成结果
  return {
    type: 'complete',
    data: {
      success: sdkMessage.subtype === 'success',
      result: sdkMessage.result,
      cost: sdkMessage.total_cost_usd,
      duration: sdkMessage.duration_ms,
      usage: usage ? {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens,
      } : undefined,
      errors: sdkMessage.errors,
    },
  };
}

/**
 * 处理 SDK session ID
 * 用于连续对话
 */
export function handleSdkSessionId(sdkMessage: SDKMessage, sessionId: string): boolean {
  if (sdkMessage.session_id) {
    sessionStore.updateSdkSessionId(sessionId, sdkMessage.session_id);
    return true;
  }
  return false;
}
