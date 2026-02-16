import type {
  ContentBlock,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
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
  type: 'text' | 'thinking' | 'tool_use';
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

  constructor(private id: string, private name: string) {}

  applyDelta(delta: ContentBlockDelta): void {
    if (delta.type === 'input_json_delta') this.inputBuffer += delta.partialJson;
  }

  build(): ToolUseBlock {
    let input: Record<string, unknown> = {};
    try {
      if (this.inputBuffer) input = JSON.parse(this.inputBuffer);
    } catch {
      // partial JSON, leave empty
    }
    return { type: 'tool_use', id: this.id, name: this.name, input };
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
          break;
        }

        case 'content_block_delta': {
          const builder = blockBuilders.get(event.index);
          builder?.applyDelta(event.delta);
          this.syncBlocksToStore(sessionId, messageId, blockBuilders);
          break;
        }

        case 'content_block_stop': {
          this.syncBlocksToStore(sessionId, messageId, blockBuilders);
          break;
        }

        case 'message_delta': {
          stopReason = event.stopReason;
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
    const finalBlocks = this.buildBlocks(blockBuilders);
    this.sessionStore.setContentBlocks(sessionId, messageId, finalBlocks);
    this.sessionStore.updateMessageStopReason(sessionId, messageId, stopReason);

    return stopReason;
  }

  private syncBlocksToStore(
    sessionId: string,
    messageId: string,
    builders: Map<number, BlockBuilder>,
  ): void {
    const blocks = this.buildBlocks(builders);
    this.sessionStore.setContentBlocks(sessionId, messageId, blocks);
  }

  private buildBlocks(builders: Map<number, BlockBuilder>): ContentBlock[] {
    return Array.from(builders.entries())
      .sort(([a], [b]) => a - b)
      .map(([, builder]) => builder.build());
  }
}
