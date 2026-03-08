import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Usage } from '../../types';
import { formatTokenCount } from '../../lib/utils';

export interface TokenUsageProps {
  usage: Usage;
}

const TokenUsage: React.FC<TokenUsageProps> = ({ usage }) => {
  const { t } = useTranslation('message');
  const [expanded, setExpanded] = useState(false);

  const totalInput = usage.input + usage.cacheRead + usage.cacheWrite;
  const hasCache = usage.cacheRead > 0 || usage.cacheWrite > 0;

  return (
    <div className="text-[11px] text-muted-foreground">
      <div
        className="flex items-center gap-2 cursor-pointer select-none"
        onClick={() => hasCache && setExpanded(!expanded)}
      >
        <Zap className="w-3 h-3" />
        <span>
          {formatTokenCount(totalInput)} {t('tokenUsage.input')} / {formatTokenCount(usage.output)} {t('tokenUsage.output')}
          {hasCache && (
            <span className="text-success ml-1">
              ({formatTokenCount(usage.cacheRead)} {t('tokenUsage.cache')})
            </span>
          )}
        </span>
      </div>

      {expanded && hasCache && (
        <div className="ml-5 mt-0.5 space-y-px text-muted-foreground/70">
          {usage.cacheRead > 0 && (
            <div>├ {formatTokenCount(usage.cacheRead)} {t('tokenUsage.cacheRead')}</div>
          )}
          {usage.cacheWrite > 0 && (
            <div>├ {formatTokenCount(usage.cacheWrite)} {t('tokenUsage.cacheWrite')}</div>
          )}
          <div>└ {formatTokenCount(usage.input)} {t('tokenUsage.new')}</div>
        </div>
      )}
    </div>
  );
};

export default TokenUsage;
