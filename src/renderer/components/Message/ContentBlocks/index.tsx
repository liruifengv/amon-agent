import React from 'react';
import { AssistantContentBlock } from '../../../types';
import TextBlock from './TextBlock';
import ThinkingBlock from './ThinkingBlock';
import ToolCallBlock from './ToolCallBlock';

export interface ContentBlockRendererProps {
  block: AssistantContentBlock;
  isStreaming?: boolean;
  isLastBlock?: boolean;
  /** Whether collapsible blocks should be collapsed by default (for historical messages) */
  defaultCollapsed?: boolean;
}

/**
 * 内容块渲染器 - 根据类型分发到对应组件
 */
const ContentBlockRenderer: React.FC<ContentBlockRendererProps> = ({
  block,
  isStreaming,
  isLastBlock,
  defaultCollapsed = false,
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

    case 'toolCall':
      return <ToolCallBlock toolCall={block} />;

    default:
      // 未知类型，静默忽略
      return null;
  }
};

export default ContentBlockRenderer;
