import type {
  ContentBlock,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  ServerToolUseBlock,
  ServerToolResultBlock,
  StopReason,
} from '@shared/types';
import type {
  NormalizedStreamEvent,
  ContentBlockStart,
  ContentBlockDelta,
} from '@shared/provider-types';
import type { SessionStore } from '../store/session-store';
import type { PushService } from '../ipc/push';

// ==================== Block Builders ====================

interface BlockBuilder {
  type: 'text' | 'thinking' | 'tool_use' | 'server_tool_use' | 'server_tool_result';
  applyDelta(delta: ContentBlockDelta): void;
  build(): ContentBlock;
}

class TextBlockBuilder implements BlockBuilder {
  type = 'text' as const;
  private text = '';

  applyDelta(delta: ContentBlockDelta): void {
    if (delta.type === 'text_delta') this.text += delta.text;
  }

  build(): TextBlock {
    return { type: 'text', text: this.text };
  }
}

class ThinkingBlockBuilder implements BlockBuilder {
  type = 'thinking' as const;
  private thinking = '';
  private signature?: string;

  applyDelta(delta: ContentBlockDelta): void {
    if (delta.type === 'thinking_delta') this.thinking += delta.thinking;
    if (delta.type === 'signature_delta') this.signature = (this.signature ?? '') + delta.signature;
  }

  build(): ThinkingBlock {
    return { type: 'thinking', thinking: this.thinking, signature: this.signature };
  }
}

class ToolUseBlockBuilder implements BlockBuilder {
  type = 'tool_use' as const;
  private inputBuffer = '';
  private signature?: string;

  constructor(private id: string, private name: string) {}

  applyDelta(delta: ContentBlockDelta): void {
    if (delta.type === 'input_json_delta') this.inputBuffer += delta.partialJson;
    if (delta.type === 'signature_delta') this.signature = (this.signature ?? '') + delta.signature;
  }

  build(): ToolUseBlock {
    let input: Record<string, unknown> = {};
    try {
      if (this.inputBuffer) input = JSON.parse(this.inputBuffer);
    } catch {
      // partial JSON, leave empty
    }
    return { type: 'tool_use', id: this.id, name: this.name, input, signature: this.signature };
  }
}

class ServerToolUseBlockBuilder implements BlockBuilder {
  type = 'server_tool_use' as const;
  private inputBuffer = '';

  constructor(
    private id: string,
    private name: string,
    private startInput: Record<string, unknown>,
    private callerType?: string,
    private callerToolId?: string,
  ) {}

  applyDelta(delta: ContentBlockDelta): void {
    if (delta.type === 'input_json_delta') this.inputBuffer += delta.partialJson;
  }

  build(): ServerToolUseBlock {
    let input = this.startInput;
    if (this.inputBuffer) {
      try { input = JSON.parse(this.inputBuffer); } catch { /* partial JSON */ }
    }
    return {
      type: 'server_tool_use',
      id: this.id,
      name: this.name,
      input,
      callerType: this.callerType,
      callerToolId: this.callerToolId,
    };
  }
}

class ServerToolResultBlockBuilder implements BlockBuilder {
  type = 'server_tool_result' as const;

  constructor(
    private toolUseId: string,
    private resultType: string,
    private resultContent: unknown,
    private callerType?: string,
    private callerToolId?: string,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  applyDelta(): void {} // No deltas for result blocks

  build(): ServerToolResultBlock {
    return {
      type: 'server_tool_result',
      toolUseId: this.toolUseId,
      resultType: this.resultType,
      content: this.resultContent,
      callerType: this.callerType,
      callerToolId: this.callerToolId,
    };
  }
}

function createBlockBuilder(block: ContentBlockStart): BlockBuilder {
  switch (block.type) {
    case 'text':
      return new TextBlockBuilder();
    case 'thinking':
      return new ThinkingBlockBuilder();
    case 'tool_use':
      return new ToolUseBlockBuilder(block.id, block.name);
    case 'server_tool_use':
      return new ServerToolUseBlockBuilder(
        block.id, block.name, block.input ?? {},
        block.callerType, block.callerToolId,
      );
    case 'server_tool_result':
      return new ServerToolResultBlockBuilder(
        block.toolUseId, block.resultType, block.content,
        block.callerType, block.callerToolId,
      );
  }
}

// ==================== Stream Normalizer ====================

export class StreamNormalizer {
  constructor(
    private sessionStore: SessionStore,
    private pushService: PushService,
  ) {}

  /**
   * 消费归一化的流式事件，实时更新 SessionStore。
   * 返回最终 stopReason。
   */
  async processStream(
    sessionId: string,
    messageId: string,
    stream: AsyncIterable<NormalizedStreamEvent>,
  ): Promise<StopReason> {
    // Snapshot existing content blocks (from previous turns / tool results)
    const existingBlocks = this.getExistingBlocks(sessionId, messageId);

    const blockBuilders = new Map<number, BlockBuilder>();
    let stopReason: StopReason = 'end_turn';

    for await (const event of stream) {
      switch (event.type) {
        case 'content_block_start': {
          const builder = createBlockBuilder(event.block);
          blockBuilders.set(event.index, builder);
          if (event.block.type === 'tool_use') {
            this.pushService.pushToolCallState(sessionId, event.block.id, {
              status: 'pending',
            });
          }
          if (event.block.type === 'server_tool_use') {
            this.pushService.pushToolCallState(sessionId, event.block.id, {
              status: 'pending',
            });
          }
          break;
        }

        case 'content_block_delta': {
          const builder = blockBuilders.get(event.index);
          builder?.applyDelta(event.delta);
          this.syncBlocksToStore(sessionId, messageId, existingBlocks, blockBuilders);
          break;
        }

        case 'content_block_stop': {
          const builder = blockBuilders.get(event.index);
          // Server tool use blocks are auto-completed (executed server-side)
          if (builder?.type === 'server_tool_use') {
            const block = builder.build() as ServerToolUseBlock;
            this.pushService.pushToolCallState(sessionId, block.id, {
              status: 'completed',
            });
          }
          this.syncBlocksToStore(sessionId, messageId, existingBlocks, blockBuilders);
          break;
        }

        case 'message_delta': {
          stopReason = event.stopReason;
          console.log("event.usage:", event.usage);
          if (event.usage) {
            this.sessionStore.updateMessageUsage(sessionId, messageId, event.usage);
          }
          break;
        }

        case 'error': {
          stopReason = 'error';
          this.pushService.pushError(sessionId, event.error.message);
          break;
        }

        // message_start and message_stop are informational, no action needed
      }
    }

    // Final sync to ensure all blocks are up to date
    const finalBlocks = [...existingBlocks, ...this.buildBlocks(blockBuilders)];
    this.sessionStore.setContentBlocks(sessionId, messageId, finalBlocks);
    this.sessionStore.updateMessageStopReason(sessionId, messageId, stopReason);

    return stopReason;
  }

  private getExistingBlocks(sessionId: string, messageId: string): ContentBlock[] {
    const msgs = this.sessionStore.getMessages(sessionId);
    const msg = msgs.find(m => m.id === messageId);
    if (msg && msg.role === 'assistant') {
      return [...(msg as import('@shared/types').AssistantMessage).content];
    }
    return [];
  }

  private syncBlocksToStore(
    sessionId: string,
    messageId: string,
    existingBlocks: ContentBlock[],
    builders: Map<number, BlockBuilder>,
  ): void {
    const blocks = [...existingBlocks, ...this.buildBlocks(builders)];
    this.sessionStore.setContentBlocks(sessionId, messageId, blocks);
  }

  private buildBlocks(builders: Map<number, BlockBuilder>): ContentBlock[] {
    return Array.from(builders.entries())
      .sort(([a], [b]) => a - b)
      .map(([, builder]) => builder.build());
  }
}
