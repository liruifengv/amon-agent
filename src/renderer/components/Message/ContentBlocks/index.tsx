import React from 'react';
import { MessageContentBlock } from '../../../types';
import TextBlock from './TextBlock';
import ThinkingBlock from './ThinkingBlock';
import ToolCallBlock from './ToolCallBlock';
import PermissionBlock from './PermissionBlock';
import UserQuestionBlock from './UserQuestionBlock';

export interface ContentBlockRendererProps {
  block: MessageContentBlock;
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
          content={block.content}
          isStreaming={isStreaming && isLastBlock}
        />
      );

    case 'thinking':
      return (
        <ThinkingBlock
          content={block.content}
          isStreaming={isStreaming}
          defaultCollapsed={defaultCollapsed}
        />
      );

    case 'tool_call':
      return <ToolCallBlock toolCall={block.toolCall} />;

    case 'permission':
      return <PermissionBlock permission={block.permission} />;

    case 'user_question':
      return <UserQuestionBlock userQuestion={block.userQuestion} />;

    default:
      // 未知类型，静默忽略
      return null;
  }
};

export default ContentBlockRenderer;
