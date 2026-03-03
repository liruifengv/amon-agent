import type { Message, AssistantMessage } from '@shared/types';
import type {
  ProviderMessage,
  ProviderUserContent,
  ProviderAssistantContent,
} from '@shared/provider-types';

export class ContextManager {
  /**
   * 将 Amon Message[] 转换为 ProviderMessage[]。
   *
   * 处理规则：
   * - UserMessage → { role: 'user', content: [text, images...] }
   * - AssistantMessage → 按 turn 边界拆分为多组 assistant/user 消息对
   *   一个 AssistantMessage 的 content 可能包含多轮 agentic loop 的结果：
   *   [Think, Text, ToolUse, ToolResult, Text, ToolUse, ToolResult, Text]
   *   需要拆分为：
   *   - assistant: [Think, Text, ToolUse]
   *   - user: [ToolResult]
   *   - assistant: [Text, ToolUse]
   *   - user: [ToolResult]
   *   - assistant: [Text]
   */
  buildProviderMessages(messages: Message[]): ProviderMessage[] {
    const result: ProviderMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        const content: ProviderUserContent[] = [{ type: 'text', text: msg.content }];
        if (msg.images) {
          for (const img of msg.images) {
            content.push({ type: 'image', data: img.base64Data, mimeType: img.mimeType });
          }
        }
        result.push({ role: 'user', content });
      } else {
        this.splitAssistantMessage(msg as AssistantMessage, result);
      }
    }

    return result;
  }

  /**
   * Split a single AssistantMessage into properly paired assistant/user messages.
   * Walks blocks linearly and flushes at tool_use→tool_result boundaries.
   */
  private splitAssistantMessage(msg: AssistantMessage, result: ProviderMessage[]): void {
    let assistantContent: ProviderAssistantContent[] = [];
    let toolResults: ProviderUserContent[] = [];

    for (const block of msg.content) {
      if (block.type === 'tool_result') {
        // Accumulate tool results
        toolResults.push({
          type: 'tool_result',
          toolUseId: block.toolUseId,
          output: block.output,
          isError: block.isError,
        });
      } else {
        // Non-tool_result block — if we have pending tool results, flush the pair first
        if (toolResults.length > 0) {
          if (assistantContent.length > 0) {
            result.push({ role: 'assistant', content: assistantContent });
            assistantContent = [];
          }
          result.push({ role: 'user', content: toolResults });
          toolResults = [];
        }

        // Accumulate assistant content
        switch (block.type) {
          case 'text':
            if (block.text) {
              assistantContent.push({ type: 'text', text: block.text });
            }
            break;
          case 'thinking':
            assistantContent.push({
              type: 'thinking',
              thinking: block.thinking,
              signature: block.signature,
            });
            break;
          case 'tool_use':
            assistantContent.push({
              type: 'tool_use',
              id: block.id,
              name: block.name,
              input: block.input,
              signature: block.signature,
            });
            break;
          case 'server_tool_use':
            assistantContent.push({
              type: 'server_tool_use',
              id: block.id,
              name: block.name,
              input: block.input,
              callerType: block.callerType,
              callerToolId: block.callerToolId,
            });
            break;
          case 'server_tool_result':
            assistantContent.push({
              type: 'server_tool_result',
              toolUseId: block.toolUseId,
              resultType: block.resultType,
              content: block.content,
              callerType: block.callerType,
              callerToolId: block.callerToolId,
            });
            break;
        }
      }
    }

    // Flush remaining
    if (assistantContent.length > 0) {
      result.push({ role: 'assistant', content: assistantContent });
    }
    if (toolResults.length > 0) {
      result.push({ role: 'user', content: toolResults });
    }
  }
}
