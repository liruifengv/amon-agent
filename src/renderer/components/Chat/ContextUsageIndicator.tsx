import React from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../store/chatStore';
import { useSessionStore } from '../../store/sessionStore';
import { getLatestAssistantUsageWithData, getUsageContextTokens } from '../../lib/usage';
import { formatTokenCount } from '../../lib/utils';
import type { AssistantMessage, SessionMessage } from '../../types';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '../ui/hover-card';

const RADIUS = 8;
const STROKE = 2;
const SIZE = (RADIUS + STROKE) * 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const ContextUsageIndicator: React.FC = () => {
  const { t } = useTranslation('chat');
  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const messages = useChatStore((s) =>
    currentSessionId ? s.sessionMessages[currentSessionId] : undefined,
  );
  const agentState = useChatStore((s) =>
    currentSessionId ? s.agentStates[currentSessionId] : undefined,
  );

  const contextWindow = agentState?.contextWindow;
  if (!contextWindow) return null;

  const assistantMessages = (messages ?? []).filter(
    (message: SessionMessage): message is AssistantMessage => message.role === 'assistant',
  );
  const latestUsage = getLatestAssistantUsageWithData(assistantMessages);
  const usedTokens = agentState?.contextTokens ?? (
    latestUsage ? getUsageContextTokens(latestUsage) : null
  );

  if (!usedTokens || usedTokens <= 0) return null;

  const percent = Math.min(Math.round((usedTokens / contextWindow) * 100), 100);
  const dashOffset = CIRCUMFERENCE * (1 - percent / 100);

  // Color based on usage level
  let strokeClass: string;
  if (percent > 90) {
    strokeClass = 'stroke-destructive';
  } else if (percent >= 70) {
    strokeClass = 'stroke-warning';
  } else {
    strokeClass = 'stroke-muted-foreground';
  }

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-default">
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            {/* Background circle */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              className="stroke-muted"
              strokeWidth={STROKE}
            />
            {/* Progress arc */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              className={strokeClass}
              strokeWidth={STROKE}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          </svg>
          <span>{percent}%</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="end" className="w-56 p-3 text-xs space-y-1.5">
        <p className="font-medium text-foreground">{t('contextUsage.title')}</p>
        <p className="text-muted-foreground">
          {t('contextUsage.usedPercent', { used: percent, remaining: 100 - percent })}
        </p>
        <p className="text-muted-foreground">
          {t('contextUsage.tokenDetail', {
            used: formatTokenCount(usedTokens),
            total: formatTokenCount(contextWindow),
          })}
        </p>
        <p className="text-muted-foreground/70 text-[10px]">
          {t('contextUsage.autoCompression')}
        </p>
      </HoverCardContent>
    </HoverCard>
  );
};

export default ContextUsageIndicator;
