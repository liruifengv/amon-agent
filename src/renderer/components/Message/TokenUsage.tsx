import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('message');
  const [expanded, setExpanded] = useState(false);

  const totalInput = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const hasCache = usage.cacheReadTokens > 0 || usage.cacheWriteTokens > 0;

  return (
    <div className="text-[11px] text-muted-foreground">
      <div
        className="flex items-center gap-2 cursor-pointer select-none"
        onClick={() => hasCache && setExpanded(!expanded)}
      >
        <Zap className="w-3 h-3" />
        <span>
          {formatTokenCount(totalInput)} {t('tokenUsage.input')} / {formatTokenCount(usage.outputTokens)} {t('tokenUsage.output')}
          {hasCache && (
            <span className="text-success ml-1">
              ({formatTokenCount(usage.cacheReadTokens)} {t('tokenUsage.cache')})
            </span>
          )}
        </span>
      </div>

      {expanded && hasCache && (
        <div className="ml-5 mt-0.5 space-y-px text-muted-foreground/70">
          {usage.cacheReadTokens > 0 && (
            <div>├ {formatTokenCount(usage.cacheReadTokens)} {t('tokenUsage.cacheRead')}</div>
          )}
          {usage.cacheWriteTokens > 0 && (
            <div>├ {formatTokenCount(usage.cacheWriteTokens)} {t('tokenUsage.cacheWrite')}</div>
          )}
          <div>└ {formatTokenCount(usage.inputTokens)} {t('tokenUsage.new')}</div>
        </div>
      )}
    </div>
  );
};

export default TokenUsage;
