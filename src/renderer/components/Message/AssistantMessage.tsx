import React, { useMemo } from 'react';
import { Message, MessageContentBlock, ToolCall } from '../../types';
import ContentBlockRenderer from './ContentBlocks';
import ToolGroup from './ToolGroup';
import SubagentToolGroup from './SubagentToolGroup';
import TodoList, { TodoItem } from './TodoList';

export interface AssistantMessageProps {
  message: Message;
  /** Whether tool groups and thinking blocks should be collapsed by default */
  defaultCollapsed?: boolean;
}

/**
 * 工具调用树节点
 */
interface ToolCallNode {
  toolCall: ToolCall;
  children: ToolCallNode[];
}

/**
 * 分组后的内容块类型
 */
type GroupedBlock =
  | { type: 'single'; block: MessageContentBlock; index: number }
  | { type: 'tool_group'; blocks: MessageContentBlock[] }
  | { type: 'subagent_group'; parentTool: ToolCall; childTools: ToolCall[] };

/**
 * 构建工具调用树
 */
function buildToolCallTree(toolCalls: ToolCall[]): {
  roots: ToolCallNode[];
  childrenMap: Map<string, ToolCall[]>;
} {
  const nodeMap = new Map<string, ToolCallNode>();
  const childrenMap = new Map<string, ToolCall[]>();
  const roots: ToolCallNode[] = [];

  // 创建所有节点
  for (const tc of toolCalls) {
    nodeMap.set(tc.id, { toolCall: tc, children: [] });
  }

  // 建立父子关系
  for (const tc of toolCalls) {
    const node = nodeMap.get(tc.id)!;
    if (tc.parentToolUseId && nodeMap.has(tc.parentToolUseId)) {
      nodeMap.get(tc.parentToolUseId)!.children.push(node);

      // 记录到 childrenMap
      const existing = childrenMap.get(tc.parentToolUseId) || [];
      existing.push(tc);
      childrenMap.set(tc.parentToolUseId, existing);
    } else if (!tc.parentToolUseId) {
      roots.push(node);
    }
  }

  return { roots, childrenMap };
}

/**
 * 将内容块分组：
 * - 连续的 tool_call 归为一组（Write/Edit/Task 除外）
 * - Task 工具（有子工具）作为 SubagentGroup
 * - Write/Edit 单独展示
 */
function groupContentBlocks(blocks: MessageContentBlock[]): GroupedBlock[] {
  const groups: GroupedBlock[] = [];
  let currentToolGroup: MessageContentBlock[] = [];

  // 需要单独展示的工具
  const standaloneTools = ['TodoWrite', 'Write', 'Edit'];

  // 提取所有工具调用
  const allToolCalls = blocks
    .filter((b): b is { type: 'tool_call'; toolCall: ToolCall } => b.type === 'tool_call')
    .map(b => b.toolCall);

  // 构建工具树
  const { childrenMap } = buildToolCallTree(allToolCalls);

  // 记录已处理的工具 ID（子工具不单独显示）
  const processedToolIds = new Set<string>();

  // 标记所有子工具
  for (const children of childrenMap.values()) {
    for (const child of children) {
      processedToolIds.add(child.id);
    }
  }

  blocks.forEach((block, index) => {
    // 跳过需要单独展示的工具
    if (block.type === 'tool_call' && standaloneTools.includes(block.toolCall.name)) {
      // 先处理累积的工具组
      if (currentToolGroup.length > 0) {
        groups.push({ type: 'tool_group', blocks: [...currentToolGroup] });
        currentToolGroup = [];
      }
      // Write/Edit 作为单独 block，TodoWrite 完全跳过（由 extractLatestTodos 处理）
      if (block.toolCall.name !== 'TodoWrite') {
        groups.push({ type: 'single', block, index });
      }
      return;
    }

    if (block.type === 'tool_call') {
      const toolCall = block.toolCall;

      // 跳过子工具（它们会在父工具的 SubagentGroup 中显示）
      if (processedToolIds.has(toolCall.id)) {
        return;
      }

      // 检查是否是 Task 工具且有子工具
      const children = childrenMap.get(toolCall.id);
      if (toolCall.name === 'Task' && children && children.length > 0) {
        // 先处理累积的工具组
        if (currentToolGroup.length > 0) {
          groups.push({ type: 'tool_group', blocks: [...currentToolGroup] });
          currentToolGroup = [];
        }
        // 作为 SubagentGroup
        groups.push({
          type: 'subagent_group',
          parentTool: toolCall,
          childTools: children,
        });
        return;
      }

      // 普通工具，加入当前工具组
      currentToolGroup.push(block);
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
const AssistantMessage: React.FC<AssistantMessageProps> = ({ message, defaultCollapsed = false }) => {
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
              />
            );
          }

          if (group.type === 'subagent_group') {
            return (
              <SubagentToolGroup
                key={`subagent-${group.parentTool.id}`}
                parentTool={group.parentTool}
                childTools={group.childTools}
                isStreaming={isStreaming}
                defaultCollapsed={true}
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
            工作中...
          </span>
        </div>
      )}
    </div>
  );
};

/**
 * 加载动画组件 - 思考中状态
 */
const LoadingIndicator: React.FC = () => (
  <div className="flex items-center gap-2">
    <span className="inline-block w-2 h-2 bg-thinking rounded-full animate-pulse" />
    <span className="text-sm font-medium text-thinking-foreground animate-pulse">
      思考中...
    </span>
  </div>
);

export default AssistantMessage;
