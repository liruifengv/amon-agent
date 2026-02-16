import type { AgentEvent, AgentToolResult } from '@mariozechner/pi-agent-core';
import type {
  AssistantMessage as PiAssistantMessage,
  TextContent,
  ThinkingContent,
  ToolCall as PiToolCall,
  Usage,
} from '@mariozechner/pi-ai';
import type {
  AssistantContentBlock,
  AssistantMessage,
  TextContentBlock,
  ThinkingContentBlock,
  ToolCallContentBlock,
  TokenUsage,
} from '../../shared/types';
import { sessionStore } from '../store/sessionStore';
import { createLogger } from '../store/logger';

const log = createLogger('EventAdapter');

/**
 * pi-ai AssistantMessage.content 元素 → Amon AssistantContentBlock
 *
 * 将 pi-ai 的内容块数组整体转换为 Amon 格式。
 * 对于 toolCall 类型，保留 SessionStore 中已有的执行状态信息。
 */
function convertPiContentToAmon(
  piContent: PiAssistantMessage['content'],
  existingBlocks: AssistantContentBlock[],
): AssistantContentBlock[] {
  // 建立已有 toolCall block 的索引，用于保留执行状态
  const existingToolBlocks = new Map<string, ToolCallContentBlock>();
  for (const block of existingBlocks) {
    if (block.type === 'toolCall') {
      existingToolBlocks.set(block.id, block);
    }
  }

  return piContent.map((item): AssistantContentBlock => {
    switch (item.type) {
      case 'text': {
        const textItem = item as TextContent;
        return {
          type: 'text',
          text: textItem.text,
        };
      }
      case 'thinking': {
        const thinkingItem = item as ThinkingContent;
        return {
          type: 'thinking',
          thinking: thinkingItem.thinking,
        };
      }
      case 'toolCall': {
        const toolCallItem = item as PiToolCall;
        const existing = existingToolBlocks.get(toolCallItem.id);
        return {
          type: 'toolCall',
          id: toolCallItem.id,
          name: toolCallItem.name,
          arguments: toolCallItem.arguments,
          // 保留已有的执行状态，默认为 pending
          status: existing?.status ?? 'pending',
          output: existing?.output,
          outputDetails: existing?.outputDetails,
          isError: existing?.isError,
          inputBuffer: existing?.inputBuffer,
        };
      }
      default:
        // 未知类型，转为文本
        log.warn('Unknown pi content type, converting to text', { type: (item as any).type });
        return {
          type: 'text',
          text: JSON.stringify(item),
        };
    }
  });
}

/**
 * pi-ai Usage → Amon TokenUsage
 */
function convertUsage(piUsage: Usage): TokenUsage {
  return {
    input: piUsage.input,
    output: piUsage.output,
    cacheRead: piUsage.cacheRead,
    cacheWrite: piUsage.cacheWrite,
    totalTokens: piUsage.totalTokens,
    cost: {
      input: piUsage.cost.input,
      output: piUsage.cost.output,
      total: piUsage.cost.total,
    },
  };
}

/**
 * 从 AgentToolResult 中提取输出文本
 */
function extractToolOutput(result: AgentToolResult<any>): string {
  if (!result.content || result.content.length === 0) return '';
  return result.content
    .filter((c): c is TextContent => c.type === 'text')
    .map(c => c.text)
    .join('\n');
}

/**
 * 创建事件适配器
 *
 * 将 pi Agent 的 AgentEvent 转换为 Amon SessionStore 操作和 IPC Push 事件。
 * 替代旧的 messageHandler.ts + streamState.ts 的全部职责。
 *
 * 多轮处理策略（方案2）：一次 agent.prompt() 可能触发多轮 LLM 调用，
 * 所有轮的内容追加到同一个 AssistantMessage 的 contentBlocks 中。
 *
 * @param sessionId - Amon 会话 ID
 * @param assistantMessageId - 预创建的 AssistantMessage 的 ID
 * @returns 事件回调函数
 */
export function createEventAdapter(
  sessionId: string,
  assistantMessageId: string,
): (event: AgentEvent) => void {
  // 追踪当前轮次中内容块的起始偏移量
  // 当多轮 LLM 调用时，后续轮的 contentIndex 从0开始，
  // 但我们需要追加到已有 contentBlocks 的末尾
  let contentBlockOffset = 0;

  return (event: AgentEvent) => {
    switch (event.type) {
      // ==================== Agent 生命周期 ====================

      case 'agent_start': {
        log.info('Agent started', undefined, sessionId);
        sessionStore.updateMessage(sessionId, assistantMessageId, {
          isStreaming: true,
        } as Partial<AssistantMessage>);
        sessionStore.setMessageState(sessionId, {
          sessionId,
          messageId: assistantMessageId,
          isStreaming: true,
        });
        break;
      }

      case 'agent_end': {
        log.info('Agent ended', { messageCount: event.messages.length }, sessionId);
        sessionStore.updateMessage(sessionId, assistantMessageId, {
          isStreaming: false,
        } as Partial<AssistantMessage>);
        sessionStore.clearMessageState(sessionId);
        // 触发完成事件
        const finalMessage = sessionStore.getMessages(sessionId)
          .find(m => m.id === assistantMessageId) as AssistantMessage | undefined;
        sessionStore.emit('message:complete', sessionId, {
          success: !finalMessage?.errorMessage,
          usage: finalMessage?.usage,
          cost: finalMessage?.usage?.cost?.total,
        });
        break;
      }

      // ==================== Turn 生命周期 ====================

      case 'turn_start': {
        log.debug('Turn started', undefined, sessionId);
        break;
      }

      case 'turn_end': {
        log.debug('Turn ended', undefined, sessionId);
        // 不做特殊处理 - toolResults 由 tool_execution_end 处理
        break;
      }

      // ==================== Message 生命周期 ====================

      case 'message_start': {
        const msg = event.message;
        if (msg.role === 'user') {
          // 忽略用户消息 - Amon 自己管理
          log.debug('Ignoring user message_start', undefined, sessionId);
          break;
        }
        if (msg.role === 'toolResult') {
          // 忽略工具结果消息 - 由 tool_execution_end 处理
          log.debug('Ignoring toolResult message_start', undefined, sessionId);
          break;
        }
        if (msg.role === 'assistant') {
          // 记录当前 contentBlocks 数量作为新轮次的偏移
          const currentMessage = sessionStore.getMessages(sessionId)
            .find(m => m.id === assistantMessageId) as AssistantMessage | undefined;
          contentBlockOffset = currentMessage?.contentBlocks?.length ?? 0;
          log.debug('Assistant message_start', { contentBlockOffset }, sessionId);
        }
        break;
      }

      case 'message_update': {
        const { message, assistantMessageEvent } = event;

        if (message.role !== 'assistant') {
          break;
        }

        const piAssistantMsg = message as PiAssistantMessage;

        // 获取当前 Amon 消息
        const currentMsg = sessionStore.getMessages(sessionId)
          .find(m => m.id === assistantMessageId) as AssistantMessage | undefined;
        const existingBlocks = currentMsg?.contentBlocks ?? [];

        // 策略：将 pi-ai 的 content 整体转换，但需要考虑多轮追加
        // piAssistantMsg.content 只包含当前轮的内容块
        // 保留之前轮的内容块（offset之前的），加上当前轮的转换结果
        const previousBlocks = existingBlocks.slice(0, contentBlockOffset);
        const currentTurnBlocks = convertPiContentToAmon(piAssistantMsg.content, existingBlocks.slice(contentBlockOffset));
        const allBlocks = [...previousBlocks, ...currentTurnBlocks];

        // 根据 assistantMessageEvent 类型做细粒度处理
        switch (assistantMessageEvent.type) {
          case 'text_start': {
            const idx = contentBlockOffset + assistantMessageEvent.contentIndex;
            if (allBlocks[idx] && allBlocks[idx].type === 'text') {
              (allBlocks[idx] as TextContentBlock).isComplete = false;
            }
            break;
          }
          case 'text_end': {
            const idx = contentBlockOffset + assistantMessageEvent.contentIndex;
            if (allBlocks[idx] && allBlocks[idx].type === 'text') {
              (allBlocks[idx] as TextContentBlock).isComplete = true;
            }
            break;
          }
          case 'thinking_start': {
            const idx = contentBlockOffset + assistantMessageEvent.contentIndex;
            if (allBlocks[idx] && allBlocks[idx].type === 'thinking') {
              (allBlocks[idx] as ThinkingContentBlock).isComplete = false;
            }
            break;
          }
          case 'thinking_end': {
            const idx = contentBlockOffset + assistantMessageEvent.contentIndex;
            if (allBlocks[idx] && allBlocks[idx].type === 'thinking') {
              (allBlocks[idx] as ThinkingContentBlock).isComplete = true;
            }
            break;
          }
          case 'toolcall_start': {
            // toolCall 已通过 convertPiContentToAmon 添加，status 默认为 pending
            break;
          }
          case 'toolcall_delta': {
            // 将 delta 追加到 inputBuffer（用于 UI 渐进显示）
            const idx = contentBlockOffset + assistantMessageEvent.contentIndex;
            if (allBlocks[idx] && allBlocks[idx].type === 'toolCall') {
              const toolBlock = allBlocks[idx] as ToolCallContentBlock;
              toolBlock.inputBuffer = (toolBlock.inputBuffer ?? '') + assistantMessageEvent.delta;
            }
            break;
          }
          case 'toolcall_end': {
            // toolCall 已通过 convertPiContentToAmon 更新 arguments
            // 标记为 running（等待执行）
            const idx = contentBlockOffset + assistantMessageEvent.contentIndex;
            if (allBlocks[idx] && allBlocks[idx].type === 'toolCall') {
              const toolBlock = allBlocks[idx] as ToolCallContentBlock;
              toolBlock.status = 'running';
              // 清空 inputBuffer（完整参数已在 arguments 中）
              toolBlock.inputBuffer = undefined;
            }
            break;
          }
          case 'text_delta':
          case 'thinking_delta':
            // 增量内容已通过 convertPiContentToAmon 整体同步
            break;
          case 'start':
            // AssistantMessage stream 开始
            break;
          case 'done':
          case 'error':
            // 由 message_end 处理
            break;
        }

        sessionStore.replaceAssistantContentBlocks(sessionId, assistantMessageId, allBlocks);
        break;
      }

      case 'message_end': {
        const msg = event.message;

        if (msg.role === 'toolResult') {
          // 忽略 - 由 tool_execution_end 处理
          log.debug('Ignoring toolResult message_end', undefined, sessionId);
          break;
        }

        if (msg.role === 'assistant') {
          const piMsg = msg as PiAssistantMessage;
          const updates: Partial<AssistantMessage> = {
            provider: piMsg.provider,
            model: piMsg.model,
            stopReason: piMsg.stopReason,
          };

          if (piMsg.usage) {
            updates.usage = convertUsage(piMsg.usage);
          }

          if (piMsg.errorMessage) {
            updates.errorMessage = piMsg.errorMessage;
          }

          log.debug('Assistant message_end', {
            provider: piMsg.provider,
            model: piMsg.model,
            stopReason: piMsg.stopReason,
            usage: piMsg.usage ? { input: piMsg.usage.input, output: piMsg.usage.output } : undefined,
          }, sessionId);

          sessionStore.updateMessage(sessionId, assistantMessageId, updates);
        }
        break;
      }

      // ==================== Tool 执行生命周期 ====================

      case 'tool_execution_start': {
        log.info('Tool execution started', {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
        }, sessionId);
        sessionStore.updateToolCallResult(
          sessionId,
          assistantMessageId,
          event.toolCallId,
          { status: 'running' },
        );
        break;
      }

      case 'tool_execution_update': {
        // 部分工具结果（用于长时间运行的工具的进度更新）
        const partialResult = event.partialResult as AgentToolResult<any>;
        if (partialResult) {
          const output = extractToolOutput(partialResult);
          if (output) {
            sessionStore.updateToolCallResult(
              sessionId,
              assistantMessageId,
              event.toolCallId,
              {
                output,
                outputDetails: partialResult.details,
              },
            );
          }
        }
        break;
      }

      case 'tool_execution_end': {
        const result = event.result as AgentToolResult<any>;
        const output = extractToolOutput(result);
        const status = event.isError ? 'error' : 'completed';

        log.info('Tool execution ended', {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          status,
          outputLength: output.length,
        }, sessionId);

        sessionStore.updateToolCallResult(
          sessionId,
          assistantMessageId,
          event.toolCallId,
          {
            status,
            output,
            outputDetails: result.details,
            isError: event.isError || undefined,
          },
        );
        break;
      }

      default: {
        log.warn('Unhandled AgentEvent type', { type: (event as any).type }, sessionId);
        break;
      }
    }
  };
}
