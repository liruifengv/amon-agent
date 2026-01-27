import { SDKMessage, ContentBlock, StreamEvent, ToolCall, TextContentBlock, ThinkingContentBlock } from '../../shared/types';
import { sessionStore } from '../store/sessionStore';
import { createLogger } from '../store/logger';
import { StreamState, generateBlockId } from './streamState';

const log = createLogger('MessageHandler');

/**
 * 消息处理上下文
 */
export interface MessageContext {
  sessionId: string;
  messageId: string;
  streamState: StreamState;
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
 * 从 SDK 消息中提取 parent_tool_use_id
 */
function extractParentToolUseId(sdkMessage: SDKMessage): string | null {
  return sdkMessage.parent_tool_use_id ?? null;
}

/**
 * 处理 SDK 消息的主入口
 */
export function handleMessage(sdkMessage: SDKMessage, ctx: MessageContext): HandleResult {
  const { sessionId } = ctx;

  // 提取 parent_tool_use_id
  const parentToolUseId = extractParentToolUseId(sdkMessage);

  // 调试：记录所有消息类型
  log.debug('SDK message received', {
    type: sdkMessage.type,
    hasMessage: !!sdkMessage.message,
    hasContent: !!sdkMessage.message?.content,
    contentLength: sdkMessage.message?.content?.length,
    parentToolUseId,
  }, sessionId);

  switch (sdkMessage.type) {
    case 'assistant':
      log.debug('Received assistant message', undefined, sessionId);
      return handleAssistantMessage(sdkMessage, ctx, parentToolUseId);

    case 'user':
      log.debug('Received user message', {
        contentTypes: sdkMessage.message?.content?.map((b: ContentBlock) => b.type)
      }, sessionId);
      return handleUserMessage(sdkMessage, ctx);

    case 'stream_event':
      return handleStreamEvent(sdkMessage, ctx, parentToolUseId);

    case 'system':
      return handleSystemMessage(sdkMessage, ctx);

    case 'result':
      log.debug('Received result message', { subtype: sdkMessage.subtype }, sessionId);
      return handleResultMessage(sdkMessage, ctx);

    case 'tool_progress':
      return handleToolProgressMessage(sdkMessage, ctx);

    default:
      log.warn('Unknown SDKMessage type', { type: (sdkMessage as { type: string }).type }, sessionId);
      return { type: 'continue' };
  }
}

/**
 * 处理 assistant 消息
 * 包含完整的消息内容，用于确保工具调用被正确添加
 * 文本和思考内容主要通过 stream_event 处理
 */
function handleAssistantMessage(
  sdkMessage: SDKMessage,
  ctx: MessageContext,
  parentToolUseId: string | null
): HandleResult {
  const { sessionId, messageId, streamState } = ctx;

  if (!sdkMessage.message?.content) {
    return { type: 'continue' };
  }

  const content = sdkMessage.message.content as ContentBlock[];

  // 获取已存在的工具调用 ID（用于去重）
  const existingToolIds = new Set(
    sessionStore.getMessages(sessionId)
      .find(m => m.id === messageId)
      ?.contentBlocks
      ?.filter(b => b.type === 'tool_call')
      .map(b => b.toolCall.id) || []
  );

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
            status: 'running',
            parentToolUseId,
          };
          log.info('Tool call received', { toolName: block.name, toolId: block.id, parentToolUseId }, sessionId);
          sessionStore.addToolCallToMessage(sessionId, messageId, toolCall);
        } else {
          // 工具已存在，更新其输入（可能之前只有部分输入）
          sessionStore.updateToolCallInput(sessionId, block.id, block.input);
          sessionStore.updateToolCallStatus(sessionId, messageId, block.id, 'running');
        }
        break;

      case 'text':
        // 如果没有通过 stream_event 处理（非流式场景），则在这里处理
        if (!streamState.hasActiveStep() && block.text) {
          const blockId = generateBlockId();
          const textBlock: TextContentBlock = {
            type: 'text',
            id: blockId,
            content: block.text,
            isComplete: true,
          };
          sessionStore.addContentBlock(sessionId, messageId, textBlock);
        }
        break;

      case 'thinking':
        // 如果没有通过 stream_event 处理（非流式场景），则在这里处理
        if (!streamState.hasActiveStep() && block.thinking) {
          const blockId = generateBlockId();
          const thinkingBlock: ThinkingContentBlock = {
            type: 'thinking',
            id: blockId,
            content: block.thinking,
            isComplete: true,
          };
          sessionStore.addContentBlock(sessionId, messageId, thinkingBlock);
        }
        break;
    }
  }

  return { type: 'continue' };
}

/**
 * 处理 user 消息
 * SDK 返回的 user 消息包含 tool_result（工具执行结果）
 */
function handleUserMessage(sdkMessage: SDKMessage, ctx: MessageContext): HandleResult {
  const { sessionId } = ctx;

  // user 消息中可能包含 tool_result
  if (!sdkMessage.message?.content) {
    log.debug('User message has no content', undefined, sessionId);
    return { type: 'continue' };
  }

  const content = sdkMessage.message.content as ContentBlock[];
  log.debug('Processing user message content', {
    blockCount: content.length,
    blockTypes: content.map(b => b.type)
  }, sessionId);

  for (const block of content) {
    if (block.type === 'tool_result') {
      // 处理工具执行结果
      log.debug('Found tool_result block', {
        tool_use_id: block.tool_use_id,
        hasContent: block.content !== undefined,
        contentType: typeof block.content,
        is_error: block.is_error
      }, sessionId);

      if (block.tool_use_id && block.content !== undefined) {
        const resultContent = typeof block.content === 'string'
          ? block.content
          : JSON.stringify(block.content, null, 2);
        const isError = block.is_error;
        log.info('Tool result received (from user message)', { toolId: block.tool_use_id, isError, contentLength: resultContent.length }, sessionId);
        sessionStore.updateToolCallResult(sessionId, block.tool_use_id, resultContent, isError);
      }
    }
  }

  return { type: 'continue' };
}

/**
 * 处理流式事件
 * 实时更新消息内容（文本/思考/工具输入增量）
 */
function handleStreamEvent(
  sdkMessage: SDKMessage,
  ctx: MessageContext,
  parentToolUseId: string | null
): HandleResult {
  const { sessionId, streamState } = ctx;
  const event = sdkMessage.event;

  if (!event) {
    return { type: 'continue' };
  }

  switch (event.type) {
    case 'message_start':
      streamState.beginStep();
      break;

    case 'content_block_start':
      handleContentBlockStart(event, ctx, parentToolUseId);
      break;

    case 'content_block_delta':
      handleContentBlockDelta(event, ctx);
      break;

    case 'content_block_stop':
      handleContentBlockStop(event, ctx);
      break;

    case 'message_delta':
      // 暂存 usage 和 stop_reason
      if (event.usage?.output_tokens !== undefined) {
        streamState.setPendingUsage(event.usage.output_tokens);
      }
      if (event.delta?.stop_reason) {
        streamState.setPendingUsage(undefined, event.delta.stop_reason);
      }
      break;

    case 'message_stop':
      streamState.resetStep();
      break;

    default:
      log.debug('Unhandled stream event type', { type: event.type }, sessionId);
      break;
  }

  return { type: 'continue' };
}

/**
 * 处理 content_block_start 事件
 */
function handleContentBlockStart(
  event: StreamEvent,
  ctx: MessageContext,
  parentToolUseId: string | null
): void {
  const { sessionId, messageId, streamState } = ctx;
  const { index, content_block } = event;

  if (index === undefined || !content_block) {
    log.warn('content_block_start missing index or content_block', { event }, sessionId);
    return;
  }

  const blockId = generateBlockId();

  switch (content_block.type) {
    case 'text': {
      const initialContent = content_block.text || '';
      streamState.openTextBlock(index, blockId, initialContent);

      const textBlock: TextContentBlock = {
        type: 'text',
        id: blockId,
        content: initialContent,
        isComplete: false,
      };
      sessionStore.addContentBlock(sessionId, messageId, textBlock);
      break;
    }

    case 'thinking': {
      streamState.openThinkingBlock(index, blockId);

      const thinkingBlock: ThinkingContentBlock = {
        type: 'thinking',
        id: blockId,
        content: '',
        isComplete: false,
      };
      sessionStore.addContentBlock(sessionId, messageId, thinkingBlock);
      break;
    }

    case 'tool_use': {
      if (!content_block.id || !content_block.name) {
        log.warn('tool_use block missing id or name', { content_block }, sessionId);
        return;
      }

      streamState.openToolBlock(index, {
        id: blockId,
        toolCallId: content_block.id,
        toolName: content_block.name,
      });

      const toolCall: ToolCall = {
        id: content_block.id,
        name: content_block.name,
        input: {},
        inputBuffer: '',
        status: 'pending',
        parentToolUseId,
      };
      sessionStore.addToolCallToMessage(sessionId, messageId, toolCall);
      log.info('Tool call started (streaming)', { toolName: content_block.name, toolId: content_block.id, parentToolUseId }, sessionId);
      break;
    }

    default:
      log.warn('Unknown content_block type', { type: content_block.type }, sessionId);
      break;
  }
}

/**
 * 处理 content_block_delta 事件
 */
function handleContentBlockDelta(event: StreamEvent, ctx: MessageContext): void {
  const { sessionId, messageId, streamState } = ctx;
  const { index, delta } = event;

  if (index === undefined || !delta) {
    return;
  }

  switch (delta.type) {
    case 'text_delta': {
      if (delta.text) {
        const block = streamState.appendDelta(index, delta.text);
        if (block && (block.kind === 'text' || block.kind === 'thinking')) {
          sessionStore.updateContentBlock(sessionId, messageId, block.id, {
            content: block.content,
          });
        }
      }
      break;
    }

    case 'thinking_delta': {
      if (delta.thinking) {
        const block = streamState.appendDelta(index, delta.thinking);
        if (block && block.kind === 'thinking') {
          sessionStore.updateContentBlock(sessionId, messageId, block.id, {
            content: block.content,
          });
        }
      }
      break;
    }

    case 'input_json_delta': {
      if (delta.partial_json) {
        const block = streamState.appendToolInputDelta(index, delta.partial_json);
        if (block) {
          sessionStore.updateToolCallInputBuffer(sessionId, block.toolCallId, block.inputBuffer);
        }
      }
      break;
    }

    default:
      log.debug('Unhandled delta type', { type: delta.type }, sessionId);
      break;
  }
}

/**
 * 处理 content_block_stop 事件
 */
function handleContentBlockStop(event: StreamEvent, ctx: MessageContext): void {
  const { sessionId, messageId, streamState } = ctx;
  const { index } = event;

  if (index === undefined) {
    return;
  }

  const block = streamState.closeBlock(index);
  if (!block) {
    return;
  }

  switch (block.kind) {
    case 'text':
    case 'thinking':
      sessionStore.updateContentBlock(sessionId, messageId, block.id, {
        isComplete: true,
      });
      break;

    case 'tool':
      // 解析累积的 JSON 输入
      if (block.inputBuffer) {
        try {
          const input = JSON.parse(block.inputBuffer);
          sessionStore.updateToolCallInput(sessionId, block.toolCallId, input);
          log.debug('Tool input parsed', { toolCallId: block.toolCallId }, sessionId);
        } catch (e) {
          log.warn('Failed to parse tool input JSON', {
            toolCallId: block.toolCallId,
            error: String(e),
            bufferLength: block.inputBuffer.length,
          }, sessionId);
        }
      }
      break;
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
 * 处理 tool_progress 消息
 * 工具执行进度更新
 */
function handleToolProgressMessage(sdkMessage: SDKMessage, ctx: MessageContext): HandleResult {
  const { sessionId } = ctx;

  if (sdkMessage.tool_use_id && sdkMessage.tool_name) {
    log.debug('Tool progress', {
      toolId: sdkMessage.tool_use_id,
      toolName: sdkMessage.tool_name,
      elapsed: sdkMessage.elapsed_time_seconds,
    }, sessionId);
  }

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
