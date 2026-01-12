import React from 'react';
import { Zap } from 'lucide-react';
import { TokenUsage as TokenUsageType } from '../../types';

export interface TokenUsageProps {
  usage: TokenUsageType;
}

/**
 * 格式化 token 数量
 */
function formatTokenCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

/**
 * Token 用量显示组件
 */
const TokenUsage: React.FC<TokenUsageProps> = ({ usage }) => {
  return (
    <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
      <Zap className="w-3 h-3" />
      <span>
        {formatTokenCount(usage.inputTokens)} 输入 / {formatTokenCount(usage.outputTokens)} 输出
        {usage.cacheReadInputTokens && usage.cacheReadInputTokens > 0 && (
          <span className="text-green-500 dark:text-green-400 ml-1">
            ({formatTokenCount(usage.cacheReadInputTokens)} 缓存)
          </span>
        )}
      </span>
      {usage.cost !== undefined && usage.cost > 0 && (
        <span className="text-gray-400 dark:text-gray-500">
          · ${usage.cost.toFixed(4)}
        </span>
      )}
      {usage.duration !== undefined && (
        <span className="text-gray-400 dark:text-gray-500">
          · {(usage.duration / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
};

export default TokenUsage;
