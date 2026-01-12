import React, { useRef, useEffect, useState } from 'react';
import { ChevronRight, Wrench } from 'lucide-react';
import { MessageContentBlock } from '../../types';
import ToolCallBlock from './ContentBlocks/ToolCallBlock';

export interface ToolGroupProps {
  blocks: MessageContentBlock[];
  isStreaming?: boolean;
}

/**
 * 工具调用组容器 - 支持折叠和自动滚动
 */
const ToolGroup: React.FC<ToolGroupProps> = ({ blocks, isStreaming }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // 流式输出时自动滚动到底部
  useEffect(() => {
    if (containerRef.current && isStreaming && isExpanded) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [blocks.length, isStreaming, isExpanded]);

  // 过滤出 tool_call 类型的块
  const toolCallBlocks = blocks.filter(
    (block): block is MessageContentBlock & { type: 'tool_call' } =>
      block.type === 'tool_call'
  );

  if (toolCallBlocks.length === 0) return null;

  return (
    <div className="my-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 overflow-hidden">
      {/* 折叠标题 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
      >
        <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        <span className="flex items-center gap-1.5">
          <Wrench className="w-4 h-4" />
          <span>Tool Use</span>
          {isStreaming && (
            <span className="inline-flex">
              <span className="animate-pulse">...</span>
            </span>
          )}
        </span>
        <span className="text-xs opacity-60 ml-auto">
          {toolCallBlocks.length} tool{toolCallBlocks.length > 1 ? 's' : ''}
        </span>
      </button>

      {/* 工具调用列表 */}
      {isExpanded && (
        <div
          ref={containerRef}
          className="p-2 space-y-2 border-t border-gray-200 dark:border-gray-700 max-h-96 overflow-y-auto"
        >
          {toolCallBlocks.map((block) => (
            <ToolCallBlock key={`tool-${block.toolCall.id}`} toolCall={block.toolCall} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ToolGroup;
