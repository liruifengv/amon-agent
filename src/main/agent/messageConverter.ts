import { type AgentMessage } from '@mariozechner/pi-agent-core';
import {
  type ImageContent,
  type TextContent,
  type Message as PiMessage,
} from '@mariozechner/pi-ai';
import type {
  Message,
  UserMessage,
  AssistantMessage,
} from '../../shared/types';

/**
 * 将 Amon 消息历史转换为 pi-ai AgentMessage[] 用于会话恢复
 */
export function convertAmonToPiMessages(messages: Message[]): AgentMessage[] {
  const piMessages: AgentMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      const userMsg = msg as UserMessage;
      const content: (TextContent | ImageContent)[] = [];

      // 添加图片
      if (userMsg.images && userMsg.images.length > 0) {
        for (const img of userMsg.images) {
          content.push({
            type: 'image',
            data: img.base64Data,
            mimeType: img.mimeType,
          });
        }
      }

      // 添加文本
      if (userMsg.content) {
        content.push({ type: 'text', text: userMsg.content });
      }

      piMessages.push({
        role: 'user',
        content: content.length === 1 && content[0].type === 'text'
          ? content[0].text
          : content,
        timestamp: userMsg.timestamp,
      } as PiMessage);
    } else if (msg.role === 'assistant') {
      const assistantMsg = msg as AssistantMessage;
      let content: (TextContent | { type: 'thinking'; thinking: string } | { type: 'toolCall'; id: string; name: string; arguments: Record<string, any> })[] = [];

      for (const block of assistantMsg.contentBlocks) {
        if (block.type === 'text') {
          content.push({ type: 'text', text: block.text });
        } else if (block.type === 'thinking') {
          content.push({ type: 'thinking', thinking: block.thinking });
        } else if (block.type === 'toolCall') {
          content.push({
            type: 'toolCall',
            id: block.id,
            name: block.name,
            arguments: block.arguments,
          });

          // 如果有工具结果，添加 toolResult 消息
          if (block.status === 'completed' || block.status === 'error') {
            piMessages.push({
              role: 'assistant',
              content,
              api: assistantMsg.provider || 'anthropic-messages',
              provider: assistantMsg.provider || 'anthropic',
              model: assistantMsg.model || 'unknown',
              usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
              stopReason: 'toolUse',
              timestamp: assistantMsg.timestamp,
            } as PiMessage);

            piMessages.push({
              role: 'toolResult',
              toolCallId: block.id,
              toolName: block.name,
              content: [{ type: 'text', text: block.output || '' }],
              isError: block.isError || false,
              timestamp: assistantMsg.timestamp,
            } as PiMessage);

            // Start a new content array for the next assistant segment
            content = [];
          }
        }
      }

      // If there are remaining content blocks (non-tool-call or final text)
      if (content.length > 0) {
        piMessages.push({
          role: 'assistant',
          content,
          api: assistantMsg.provider || 'anthropic-messages',
          provider: assistantMsg.provider || 'anthropic',
          model: assistantMsg.model || 'unknown',
          usage: assistantMsg.usage
            ? { ...assistantMsg.usage, cost: { ...assistantMsg.usage.cost, cacheRead: 0, cacheWrite: 0 } }
            : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: assistantMsg.stopReason || 'stop',
          timestamp: assistantMsg.timestamp,
        } as PiMessage);
      }
    }
  }

  return piMessages;
}
