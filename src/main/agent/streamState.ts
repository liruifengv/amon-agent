import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../store/logger';

const log = createLogger('StreamState');

/**
 * Block 类型
 */
export type BlockKind = 'text' | 'thinking' | 'tool';

/**
 * 基础 Block 状态
 */
interface BaseBlockState {
  /** 内容块 ID（用于 UI 追踪） */
  id: string;
  /** 内容块索引（SDK 返回的 index） */
  index: number;
  /** 内容块类型 */
  kind: BlockKind;
}

/**
 * 文本 Block 状态
 */
export interface TextBlockState extends BaseBlockState {
  kind: 'text';
  /** 累积的文本内容 */
  content: string;
}

/**
 * 思考 Block 状态
 */
export interface ThinkingBlockState extends BaseBlockState {
  kind: 'thinking';
  /** 累积的思考内容 */
  content: string;
}

/**
 * 工具 Block 状态
 */
export interface ToolBlockState extends BaseBlockState {
  kind: 'tool';
  /** SDK 返回的工具调用 ID */
  toolCallId: string;
  /** 工具名称 */
  toolName: string;
  /** 累积的 JSON 输入缓冲 */
  inputBuffer: string;
}

export type BlockState = TextBlockState | ThinkingBlockState | ToolBlockState;

/**
 * 暂存的使用量信息
 */
interface PendingUsage {
  outputTokens?: number;
  stopReason?: string;
}

/**
 * 生成内容块 ID
 */
export function generateBlockId(): string {
  return `block_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
}

/**
 * 流式状态管理类
 *
 * 用于追踪 Claude SDK 流式消息中的内容块生命周期。
 * 每个查询应创建一个新的 StreamState 实例。
 *
 * 生命周期：
 * 1. message_start → beginStep()
 * 2. content_block_start → openTextBlock/openThinkingBlock/openToolBlock
 * 3. content_block_delta → appendDelta/appendToolInputDelta
 * 4. content_block_stop → closeBlock()
 * 5. message_delta → setPendingUsage()
 * 6. message_stop → resetStep()
 */
export class StreamState {
  /** 按 index 追踪的活跃 blocks */
  private blocksByIndex: Map<number, BlockState> = new Map();

  /** 暂存的使用量（等待 message_stop 时使用） */
  private pendingUsage: PendingUsage = {};

  /** 当前 step 是否活跃 */
  private stepActive = false;

  /** 会话 ID（用于日志） */
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  // ============ Step 生命周期 ============

  /**
   * 开始新的 step（message_start 时调用）
   */
  beginStep(): void {
    this.stepActive = true;
    log.debug('Step began', undefined, this.sessionId);
  }

  /**
   * 检查是否有活跃的 step
   */
  hasActiveStep(): boolean {
    return this.stepActive;
  }

  /**
   * 重置 step 状态（message_stop 时调用）
   */
  resetStep(): void {
    this.blocksByIndex.clear();
    this.pendingUsage = {};
    this.stepActive = false;
    log.debug('Step reset', undefined, this.sessionId);
  }

  // ============ Block 操作 ============

  /**
   * 打开文本 block
   */
  openTextBlock(index: number, id: string, initialContent = ''): TextBlockState {
    const block: TextBlockState = {
      id,
      index,
      kind: 'text',
      content: initialContent,
    };
    this.blocksByIndex.set(index, block);
    log.debug('Text block opened', { index, id }, this.sessionId);
    return block;
  }

  /**
   * 打开思考 block
   */
  openThinkingBlock(index: number, id: string): ThinkingBlockState {
    const block: ThinkingBlockState = {
      id,
      index,
      kind: 'thinking',
      content: '',
    };
    this.blocksByIndex.set(index, block);
    log.debug('Thinking block opened', { index, id }, this.sessionId);
    return block;
  }

  /**
   * 打开工具 block
   */
  openToolBlock(
    index: number,
    params: { id: string; toolCallId: string; toolName: string }
  ): ToolBlockState {
    const block: ToolBlockState = {
      id: params.id,
      index,
      kind: 'tool',
      toolCallId: params.toolCallId,
      toolName: params.toolName,
      inputBuffer: '',
    };
    this.blocksByIndex.set(index, block);
    log.debug('Tool block opened', { index, ...params }, this.sessionId);
    return block;
  }

  /**
   * 获取指定 index 的 block
   */
  getBlock(index: number): BlockState | undefined {
    return this.blocksByIndex.get(index);
  }

  /**
   * 追加文本/思考增量
   */
  appendDelta(index: number, content: string): BlockState | undefined {
    const block = this.blocksByIndex.get(index);
    if (!block) {
      log.warn('appendDelta: block not found', { index }, this.sessionId);
      return undefined;
    }

    if (block.kind === 'text' || block.kind === 'thinking') {
      block.content += content;
      return block;
    }

    log.warn('appendDelta: wrong block kind', { index, kind: block.kind }, this.sessionId);
    return undefined;
  }

  /**
   * 追加工具输入 JSON 增量
   */
  appendToolInputDelta(index: number, jsonDelta: string): ToolBlockState | undefined {
    const block = this.blocksByIndex.get(index);
    if (!block) {
      log.warn('appendToolInputDelta: block not found', { index }, this.sessionId);
      return undefined;
    }

    if (block.kind !== 'tool') {
      log.warn('appendToolInputDelta: wrong block kind', { index, kind: block.kind }, this.sessionId);
      return undefined;
    }

    block.inputBuffer += jsonDelta;
    return block;
  }

  /**
   * 关闭指定 index 的 block
   */
  closeBlock(index: number): BlockState | undefined {
    const block = this.blocksByIndex.get(index);
    if (!block) {
      log.warn('closeBlock: block not found', { index }, this.sessionId);
      return undefined;
    }

    this.blocksByIndex.delete(index);
    log.debug('Block closed', { index, kind: block.kind, id: block.id }, this.sessionId);
    return block;
  }

  /**
   * 获取第一个打开的文本 block（用于兼容旧逻辑）
   */
  getFirstOpenTextBlock(): TextBlockState | undefined {
    for (const block of this.blocksByIndex.values()) {
      if (block.kind === 'text') {
        return block;
      }
    }
    return undefined;
  }

  /**
   * 获取所有活跃的 blocks
   */
  getAllBlocks(): BlockState[] {
    return Array.from(this.blocksByIndex.values());
  }

  // ============ Usage 管理 ============

  /**
   * 设置暂存的使用量（message_delta 时调用）
   */
  setPendingUsage(outputTokens?: number, stopReason?: string): void {
    if (outputTokens !== undefined) {
      this.pendingUsage.outputTokens = outputTokens;
    }
    if (stopReason !== undefined) {
      this.pendingUsage.stopReason = stopReason;
    }
  }

  /**
   * 获取暂存的使用量
   */
  getPendingUsage(): PendingUsage {
    return { ...this.pendingUsage };
  }
}
