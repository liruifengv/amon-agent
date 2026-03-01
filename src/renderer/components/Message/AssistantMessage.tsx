import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AssistantMessage as AssistantMessageType,
  ContentBlock,
  ToolUseBlock,
  ToolResultBlock,
  ServerToolResultBlock,
} from '../../types';
import ContentBlockRenderer from './ContentBlocks';
import ToolGroup from './ToolGroup';
import TodoList, { TodoItem } from './TodoList';

export interface AssistantMessageProps {
  message: AssistantMessageType;
  /** Whether tool groups and thinking blocks should be collapsed by default */
  defaultCollapsed?: boolean;
  /** Current session ID for accessing tool call state */
  sessionId: string | null;
  /** Whether the session is currently streaming */
  isStreaming: boolean;
}

/**
 * 分组后的内容块类型
 */
type GroupedBlock =
  | { type: 'single'; block: ContentBlock; index: number }
  | { type: 'tool_group'; blocks: ToolUseBlock[] };

/**
 * 将内容块分组：
 * - 连续的 tool_use 归为一组（Write/Edit/TodoWrite 除外）
 * - Write/Edit 单独展示
 * - TodoWrite 不展示（由 extractLatestTodos 处理）
 * - tool_result 块跳过（不直接渲染）
 */
function groupContentBlocks(blocks: ContentBlock[]): GroupedBlock[] {
  const groups: GroupedBlock[] = [];
  let currentToolGroup: ToolUseBlock[] = [];

  // 需要单独展示的工具
  const standaloneTools = ['TodoWrite', 'Write', 'Edit'];

  blocks.forEach((block, index) => {
    if (block.type === 'tool_use') {
      // TodoWrite 完全跳过
      if (block.name === 'TodoWrite') {
        return;
      }

      // Write/Edit 单独展示
      if (standaloneTools.includes(block.name)) {
        // 先处理累积的工具组
        if (currentToolGroup.length > 0) {
          groups.push({ type: 'tool_group', blocks: [...currentToolGroup] });
          currentToolGroup = [];
        }
        groups.push({ type: 'single', block, index });
        return;
      }

      // 普通工具，加入当前工具组
      currentToolGroup.push(block);
    } else if (block.type === 'tool_result') {
      // tool_result 块跳过，不直接渲染
      return;
    } else if (block.type === 'server_tool_result') {
      // server_tool_result rendered inside its parent ServerToolBlock
      return;
    } else {
      // 非工具块
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
function extractLatestTodos(blocks: ContentBlock[]): TodoItem[] | null {
  // 从后往前找最新的 TodoWrite
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block.type === 'tool_use' && block.name === 'TodoWrite') {
      const args = block.input as { todos?: TodoItem[] };
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

  // 分组内容块
  const groupedBlocks = useMemo(() => {
    if (!content || content.length === 0) return [];
    return groupContentBlocks(content);
  }, [content]);

  // 构建 toolUseId → ToolResultBlock 查找表
  const toolResultMap = useMemo(() => {
    const map = new Map<string, ToolResultBlock>();
    if (!content) return map;
    for (const block of content) {
      if (block.type === 'tool_result') {
        map.set(block.toolUseId, block);
      }
    }
    return map;
  }, [content]);

  // 构建 server toolUseId → ServerToolResultBlock 查找表
  const serverToolResultMap = useMemo(() => {
    const map = new Map<string, ServerToolResultBlock>();
    if (!content) return map;
    for (const block of content) {
      if (block.type === 'server_tool_result') {
        map.set(block.toolUseId, block);
      }
    }
    return map;
  }, [content]);

  // 提取 todos
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
                toolResultMap={toolResultMap}
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
              toolResultMap={toolResultMap}
              serverToolResultMap={serverToolResultMap}
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

      {/* 统一的流式指示器 - 显示在消息最底部，只有当有内容时才显示 */}
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

/**
 * 加载动画组件 - 思考中状态
 */
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
