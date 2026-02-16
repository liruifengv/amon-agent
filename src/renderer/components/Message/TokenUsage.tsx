import React from 'react';
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
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <Zap className="w-3 h-3" />
      <span>
        {formatTokenCount(usage.inputTokens)} {t('tokenUsage.input')} / {formatTokenCount(usage.outputTokens)} {t('tokenUsage.output')}
        {usage.cacheReadTokens > 0 && (
          <span className="text-success ml-1">
            ({formatTokenCount(usage.cacheReadTokens)} {t('tokenUsage.cache')})
          </span>
        )}
      </span>
    </div>
  );
};

export default TokenUsage;
