import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AssistantMessage as AssistantMessageType,
  TextContent,
  ThinkingContent,
  ToolCall,
} from '../../types';
import ContentBlockRenderer from './ContentBlocks';
import ToolGroup from './ToolGroup';
import TodoList, { TodoItem } from './TodoList';

export interface AssistantMessageProps {
  message: AssistantMessageType;
  defaultCollapsed?: boolean;
  sessionId: string | null;
  isStreaming: boolean;
}

type ContentItem = TextContent | ThinkingContent | ToolCall;

/**
 * 分组后的内容块类型
 */
type GroupedBlock =
  | { type: 'single'; block: ContentItem; index: number }
  | { type: 'tool_group'; blocks: ToolCall[] };

/**
 * 将内容块分组：
 * - 连续的 toolCall 归为一组（Write/Edit/TodoWrite 除外）
 * - Write/Edit 单独展示
 * - TodoWrite 不展示（由 extractLatestTodos 处理）
 */
function groupContentBlocks(blocks: ContentItem[]): GroupedBlock[] {
  const groups: GroupedBlock[] = [];
  let currentToolGroup: ToolCall[] = [];

  const standaloneTools = ['TodoWrite', 'Write', 'Edit'];

  blocks.forEach((block, index) => {
    if (block.type === 'toolCall') {
      if (block.name === 'TodoWrite') {
        return;
      }

      if (standaloneTools.includes(block.name)) {
        if (currentToolGroup.length > 0) {
          groups.push({ type: 'tool_group', blocks: [...currentToolGroup] });
          currentToolGroup = [];
        }
        groups.push({ type: 'single', block, index });
        return;
      }

      currentToolGroup.push(block);
    } else {
      if (currentToolGroup.length > 0) {
        groups.push({ type: 'tool_group', blocks: [...currentToolGroup] });
        currentToolGroup = [];
      }
      groups.push({ type: 'single', block, index });
    }
  });

  if (currentToolGroup.length > 0) {
    groups.push({ type: 'tool_group', blocks: currentToolGroup });
  }

  return groups;
}

/**
 * 提取最新的 TodoWrite 调用中的 todos
 */
function extractLatestTodos(blocks: ContentItem[]): TodoItem[] | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block.type === 'toolCall' && block.name === 'TodoWrite') {
      const args = block.arguments as { todos?: TodoItem[] };
      return args.todos || null;
    }
  }
  return null;
}

/**
 * 助手消息组件
 */
const AssistantMessageComponent: React.FC<AssistantMessageProps> = ({ message, defaultCollapsed = false, sessionId, isStreaming }) => {
  const { t } = useTranslation('message');
  const { content } = message;

  const groupedBlocks = useMemo(() => {
    if (!content || content.length === 0) return [];
    return groupContentBlocks(content);
  }, [content]);

  const latestTodos = useMemo(() => {
    if (!content || content.length === 0) return null;
    return extractLatestTodos(content);
  }, [content]);

  const hasContent = content && content.length > 0;
  const totalBlocks = content?.length || 0;

  return (
    <div className="text-[15px] leading-relaxed w-full text-foreground">
      {hasContent ? (
        groupedBlocks.map((group, groupIndex) => {
          if (group.type === 'tool_group') {
            return (
              <ToolGroup
                key={`tool-group-${groupIndex}`}
                blocks={group.blocks}
                isStreaming={isStreaming}
                defaultCollapsed={defaultCollapsed}
                sessionId={sessionId}
              />
            );
          }

          return (
            <ContentBlockRenderer
              key={`block-${group.index}`}
              block={group.block}
              isStreaming={isStreaming}
              isLastBlock={group.index === totalBlocks - 1}
              defaultCollapsed={defaultCollapsed}
              sessionId={sessionId}
            />
          );
        })
      ) : isStreaming ? (
        <LoadingIndicator />
      ) : null}

      {latestTodos && latestTodos.length > 0 && (
        <div className="mt-3">
          <TodoList todos={latestTodos} />
        </div>
      )}

      {isStreaming && hasContent && (
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse" />
          <span className="text-sm font-medium text-primary/80 animate-pulse">
            {t('working')}
          </span>
        </div>
      )}
    </div>
  );
};

const LoadingIndicator: React.FC = () => {
  const { t } = useTranslation('message');
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block w-2 h-2 bg-thinking rounded-full animate-pulse" />
      <span className="text-sm font-medium text-thinking-foreground animate-pulse">
        {t('thinkingWithEllipsis')}
      </span>
    </div>
  );
};

export default AssistantMessageComponent;
