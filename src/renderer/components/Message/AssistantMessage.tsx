import React, { useMemo } from 'react';
import { Message, MessageContentBlock } from '../../types';
import ContentBlockRenderer from './ContentBlocks';
import ToolGroup from './ToolGroup';
import TodoList, { TodoItem } from './TodoList';

export interface AssistantMessageProps {
  message: Message;
}

/**
 * 分组后的内容块类型
 */
type GroupedBlock =
  | { type: 'single'; block: MessageContentBlock; index: number }
  | { type: 'tool_group'; blocks: MessageContentBlock[] };

/**
 * 将内容块分组：连续的 tool_call 归为一组
 */
function groupContentBlocks(blocks: MessageContentBlock[]): GroupedBlock[] {
  const groups: GroupedBlock[] = [];
  let currentToolGroup: MessageContentBlock[] = [];

  blocks.forEach((block, index) => {
    // 跳过 TodoWrite 工具调用（单独处理）
    if (block.type === 'tool_call' && block.toolCall.name === 'TodoWrite') {
      return;
    }

    if (block.type === 'tool_call') {
      currentToolGroup.push(block);
    } else {
      // 如果有累积的工具调用组，先添加
      if (currentToolGroup.length > 0) {
        groups.push({ type: 'tool_group', blocks: [...currentToolGroup] });
        currentToolGroup = [];
      }
      groups.push({ type: 'single', block, index });
    }
  });

  // 处理末尾的工具调用组
  if (currentToolGroup.length > 0) {
    groups.push({ type: 'tool_group', blocks: currentToolGroup });
  }

  return groups;
}

/**
 * 提取最新的 TodoWrite 调用中的 todos
 */
function extractLatestTodos(blocks: MessageContentBlock[]): TodoItem[] | null {
  // 从后往前找最新的 TodoWrite
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block.type === 'tool_call' && block.toolCall.name === 'TodoWrite') {
      const input = block.toolCall.input as { todos?: TodoItem[] };
      return input.todos || null;
    }
  }
  return null;
}

/**
 * 助手消息组件
 */
const AssistantMessage: React.FC<AssistantMessageProps> = ({ message }) => {
  const { contentBlocks, isStreaming } = message;

  // 分组内容块
  const groupedBlocks = useMemo(() => {
    if (!contentBlocks) return [];
    return groupContentBlocks(contentBlocks);
  }, [contentBlocks]);

  // 提取 todos
  const latestTodos = useMemo(() => {
    if (!contentBlocks) return null;
    return extractLatestTodos(contentBlocks);
  }, [contentBlocks]);

  const hasContent = contentBlocks && contentBlocks.length > 0;
  const totalBlocks = contentBlocks?.length || 0;

  return (
    <div className="text-[15px] leading-relaxed w-full text-gray-800 dark:text-gray-100">
      {hasContent ? (
        groupedBlocks.map((group, groupIndex) => {
          if (group.type === 'tool_group') {
            return (
              <ToolGroup
                key={`tool-group-${groupIndex}`}
                blocks={group.blocks}
                isStreaming={isStreaming}
              />
            );
          }

          return (
            <ContentBlockRenderer
              key={`block-${group.index}`}
              block={group.block}
              isStreaming={isStreaming}
              isLastBlock={group.index === totalBlocks - 1}
            />
          );
        })
      ) : isStreaming ? (
        // 正在加载，没有内容时显示加载动画
        <LoadingIndicator />
      ) : null}

      {/* TODO 列表 - 恒定显示在底部 */}
      {latestTodos && latestTodos.length > 0 && (
        <div className="mt-3">
          <TodoList todos={latestTodos} />
        </div>
      )}
    </div>
  );
};

/**
 * 加载动画组件
 */
const LoadingIndicator: React.FC = () => (
  <div className="flex items-center gap-1.5 py-1">
    <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
    <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
    <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
  </div>
);

export default AssistantMessage;
