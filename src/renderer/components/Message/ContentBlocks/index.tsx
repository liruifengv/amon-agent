import React from 'react';
import { ContentBlock, ToolResultBlock } from '../../../types';
import TextBlock from './TextBlock';
import ThinkingBlock from './ThinkingBlock';
import ToolCallBlock from './ToolCallBlock';

export interface ContentBlockRendererProps {
  block: ContentBlock;
  isStreaming?: boolean;
  isLastBlock?: boolean;
  /** Whether collapsible blocks should be collapsed by default (for historical messages) */
  defaultCollapsed?: boolean;
  /** Current session ID for accessing tool call state */
  sessionId: string | null;
  /** Map from toolUseId to ToolResultBlock for status derivation */
  toolResultMap?: Map<string, ToolResultBlock>;
}

/**
 * 内容块渲染器 - 根据类型分发到对应组件
 */
const ContentBlockRenderer: React.FC<ContentBlockRendererProps> = ({
  block,
  isStreaming,
  isLastBlock,
  defaultCollapsed = false,
  sessionId,
  toolResultMap,
}) => {
  switch (block.type) {
    case 'text':
      return (
        <TextBlock
          content={block.text}
          isStreaming={isStreaming && isLastBlock}
        />
      );

    case 'thinking':
      return (
        <ThinkingBlock
          content={block.thinking}
          isStreaming={isStreaming}
          defaultCollapsed={defaultCollapsed}
        />
      );

    case 'tool_use':
      return <ToolCallBlock toolCall={block} sessionId={sessionId} toolResult={toolResultMap?.get(block.id)} />;

    default:
      // 未知类型（包括 tool_result），静默忽略
      return null;
  }
};

export default ContentBlockRenderer;
