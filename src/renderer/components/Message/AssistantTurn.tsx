import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssistantMessage as AssistantMessageType, Usage } from '../../types';
import { useChatStore } from '../../store/chatStore';
import { useSessionStore } from '../../store/sessionStore';
import AssistantMessage from './AssistantMessage';
import TokenUsage from './TokenUsage';

export interface AssistantTurnProps {
  messages: AssistantMessageType[];
  isLastTurn: boolean;
}

function sumUsage(messages: AssistantMessageType[]): Usage | null {
  let has = false;
  const total: Usage = {
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
  for (const msg of messages) {
    const u = msg.usage;
    if (!u) continue;
    has = true;
    total.input += u.input;
    total.output += u.output;
    total.cacheRead += u.cacheRead;
    total.cacheWrite += u.cacheWrite;
    total.totalTokens += u.totalTokens;
    total.cost.input += u.cost.input;
    total.cost.output += u.cost.output;
    total.cost.cacheRead += u.cost.cacheRead;
    total.cost.cacheWrite += u.cost.cacheWrite;
    total.cost.total += u.cost.total;
  }
  return has ? total : null;
}

function formatTimestamp(timestamp: number, locale: string): string {
  return new Date(timestamp).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Renders all assistant messages within a single agent turn as one visual block,
 * with a single combined footer (token usage + timestamp).
 */
const AssistantTurn: React.FC<AssistantTurnProps> = ({ messages, isLastTurn }) => {
  const { i18n } = useTranslation();
  const { currentSessionId } = useSessionStore();
  const isStreaming = useChatStore((state) => state.isSessionLoading(currentSessionId));
  const isActivelyStreaming = isLastTurn && isStreaming;

  const combinedUsage = useMemo(() => sumUsage(messages), [messages]);

  const lastMessage = messages[messages.length - 1];
  const showTokenUsage = !isActivelyStreaming && combinedUsage !== null;
  const locale = i18n.language === 'zh' ? 'zh-CN' : 'en-US';

  return (
    <div className="flex flex-col items-start">
      <div className="space-y-2 items-start">
        {messages.map((msg, i) => {
          const isLastInTurn = i === messages.length - 1;
          // Only the last message of the last (active) turn is non-historical
          const defaultCollapsed = !(isLastTurn && isLastInTurn && isActivelyStreaming);

          return (
            <AssistantMessage
              key={`assistant-${msg.timestamp}-${i}`}
              message={msg}
              defaultCollapsed={defaultCollapsed}
              sessionId={currentSessionId}
              isStreaming={isLastInTurn && isActivelyStreaming}
            />
          );
        })}

        {/* Single footer for the entire turn */}
        <div className="flex flex-col gap-1 mt-1 items-start pl-1">
          {showTokenUsage && <TokenUsage usage={combinedUsage} />}
          <div className="text-[11px] text-muted-foreground">
            {formatTimestamp(lastMessage.timestamp, locale)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssistantTurn;
