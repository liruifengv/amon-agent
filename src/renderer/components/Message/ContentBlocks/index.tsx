import React from 'react';
import type { TextContent, ThinkingContent, ToolCall } from '../../../types';
import TextBlock from './TextBlock';
import ThinkingBlock from './ThinkingBlock';
import ToolCallBlock from './ToolCallBlock';

type ContentItem = TextContent | ThinkingContent | ToolCall;

export interface ContentBlockRendererProps {
  block: ContentItem;
  isStreaming?: boolean;
  isLastBlock?: boolean;
  defaultCollapsed?: boolean;
  sessionId: string | null;
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
      return <ToolCallBlock toolCall={block} sessionId={sessionId} />;

    default:
      return null;
  }
};

export default ContentBlockRenderer;
