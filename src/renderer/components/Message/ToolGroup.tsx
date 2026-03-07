import React, { useRef, useEffect, useState } from 'react';
import { ChevronRight, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ToolCall } from '../../types';
import ToolCallBlock from './ContentBlocks/ToolCallBlock';

export interface ToolGroupProps {
  blocks: ToolCall[];
  isStreaming?: boolean;
  defaultCollapsed?: boolean;
  sessionId: string | null;
}

/**
 * 工具调用组容器 - 支持折叠和自动滚动
 */
const ToolGroup: React.FC<ToolGroupProps> = ({ blocks, isStreaming, defaultCollapsed = false, sessionId }) => {
  const { t } = useTranslation('message');
  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && isStreaming && isExpanded) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [blocks.length, isStreaming, isExpanded]);

  if (blocks.length === 0) return null;

  return (
    <div className="my-3 rounded-lg border border-border bg-muted/50 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-tool-foreground hover:text-tool hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
      >
        <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        <span className="flex items-center gap-1.5">
          <Wrench className="w-4 h-4" />
          <span>{t('tool.toolUse')}</span>
          {isStreaming && (
            <span className="inline-flex">
              <span className="animate-pulse">...</span>
            </span>
          )}
        </span>
        <span className="text-xs opacity-60 ml-auto">
          {t('tool.toolCount', { count: blocks.length })}
        </span>
      </button>

      {isExpanded && (
        <div
          ref={containerRef}
          className="p-2 space-y-2 border-t border-border max-h-96 overflow-y-auto"
        >
          {blocks.map((block) => (
            <ToolCallBlock key={`tool-${block.id}`} toolCall={block} sessionId={sessionId} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ToolGroup;
