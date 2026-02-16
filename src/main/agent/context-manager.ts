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
   * - AssistantMessage → 拆分为 assistant content + user tool_results
   *   - text/thinking/tool_use → assistant role
   *   - tool_result → user role（Anthropic API 要求）
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
        const assistantMsg = msg as AssistantMessage;
        const assistantContent: ProviderAssistantContent[] = [];
        const toolResults: ProviderUserContent[] = [];

        for (const block of assistantMsg.content) {
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
              });
              break;
            case 'tool_result':
              toolResults.push({
                type: 'tool_result',
                toolUseId: block.toolUseId,
                output: block.output,
                isError: block.isError,
              });
              break;
          }
        }

        if (assistantContent.length > 0) {
          result.push({ role: 'assistant', content: assistantContent });
        }
        if (toolResults.length > 0) {
          result.push({ role: 'user', content: toolResults });
        }
      }
    }

    return result;
  }
}
