import React, { useState, useMemo } from 'react';
import { ToolUseBlock, ToolCallState } from '../../types';
import { useChatStore } from '../../store/chatStore';
import { ChevronRight, Bot, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ToolCallBlock from './ContentBlocks/ToolCallBlock';

export interface SubagentToolGroupProps {
  /** Task 工具调用（父工具） */
  parentTool: ToolUseBlock;
  /** 子工具调用列表 */
  childTools: ToolUseBlock[];
  /** 是否正在流式传输 */
  isStreaming?: boolean;
  /** 是否默认折叠 */
  defaultCollapsed?: boolean;
  /** Current session ID for accessing tool call state */
  sessionId: string | null;
}

/**
 * 获取 Subagent 描述
 */
function getSubagentDescription(parentTool: ToolUseBlock): string {
  const args = parentTool.input as {
    description?: string;
    subagent_type?: string;
    prompt?: string;
  };

  if (args.description) {
    // 截断过长的描述
    return args.description.length > 60
      ? args.description.slice(0, 60) + '...'
      : args.description;
  }

  if (args.subagent_type) {
    return `${args.subagent_type} agent`;
  }

  return 'Subagent';
}

/**
 * 检查 Subagent 是否正在运行
 */
function isSubagentRunning(
  parentState: ToolCallState | undefined,
  childStates: (ToolCallState | undefined)[]
): boolean {
  // 如果父工具还在运行
  if (parentState?.status === 'running' || parentState?.status === 'pending') {
    return true;
  }

  // 如果有任何子工具还在运行
  return childStates.some(s => s?.status === 'running' || s?.status === 'pending');
}

/**
 * Subagent 工具组组件
 *
 * 用于显示 Task 工具调用及其子工具调用的层级结构。
 * 默认折叠，可展开查看子工具详情。
 */
const SubagentToolGroup: React.FC<SubagentToolGroupProps> = ({
  parentTool,
  childTools,
  defaultCollapsed = true,
  sessionId,
}) => {
  const { t } = useTranslation('message');
  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed);

  // 获取父工具和子工具的运行时状态
  const parentState = useChatStore((state) => state.getToolCallState(sessionId, parentTool.id));
  const childStates = useMemo(
    () => childTools.map(ct => useChatStore.getState().getToolCallState(sessionId, ct.id)),
    [childTools, sessionId]
  );

  const description = useMemo(() => getSubagentDescription(parentTool), [parentTool]);
  const isRunning = useMemo(
    () => isSubagentRunning(parentState, childStates),
    [parentState, childStates]
  );

  // 统计子工具状态
  const stats = useMemo(() => {
    const completed = childStates.filter(s => s?.status === 'completed').length;
    const errors = childStates.filter(s => s?.status === 'error').length;
    const total = childTools.length;
    return { completed, errors, total };
  }, [childStates, childTools.length]);

  return (
    <div className="my-2 rounded-lg border border-border bg-muted/30 overflow-hidden">
      {/* 头部 - 可点击折叠 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        {/* 折叠图标 */}
        <ChevronRight
          className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${
            isExpanded ? 'rotate-90' : ''
          }`}
        />

        {/* Subagent 图标 */}
        <Bot className="w-4 h-4 text-primary shrink-0" />

        {/* 描述 */}
        <span className="text-sm font-medium text-foreground truncate flex-1">
          {description}
        </span>

        {/* 统计信息 */}
        {stats.total > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">
            {stats.completed}/{stats.total}
            {stats.errors > 0 && (
              <span className="text-red-500 ml-1">({stats.errors} {t('errors')})</span>
            )}
          </span>
        )}

        {/* 运行状态 */}
        {isRunning && (
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
        )}
      </button>

      {/* 展开的子工具列表 */}
      {isExpanded && childTools.length > 0 && (
        <div className="border-t border-border max-h-[400px] overflow-y-auto">
          {/* 左侧边框指示层级 */}
          <div className="ml-3 pl-3 border-l-2 border-primary/20 py-2 space-y-2">
            {childTools.map((tool) => (
              <ToolCallBlock key={tool.id} toolCall={tool} isNested sessionId={sessionId} />
            ))}
          </div>
        </div>
      )}

      {/* 空状态 */}
      {isExpanded && childTools.length === 0 && isRunning && (
        <div className="border-t border-border px-3 py-2">
          <div className="ml-6 text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('subagentWorking')}
          </div>
        </div>
      )}
    </div>
  );
};

export default SubagentToolGroup;
