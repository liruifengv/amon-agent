import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Message, AssistantMessage as AssistantMessageType } from '../../types';
import { useChatStore } from '../../store/chatStore';
import { useSessionStore } from '../../store/sessionStore';
import UserMessage from './UserMessage';
import AssistantMessage from './AssistantMessage';
import TokenUsage from './TokenUsage';

export interface MessageItemProps {
  message: Message;
  isLastMessage?: boolean;
}

/**
 * 消息项组件 - 根据角色分发渲染
 */
const MessageItem: React.FC<MessageItemProps> = ({ message, isLastMessage = false }) => {
  const isUser = message.role === 'user';
  const { currentSessionId } = useSessionStore();
  const isStreaming = useChatStore((state) => state.isSessionLoading(currentSessionId));

  const isActivelyStreaming = isLastMessage && isStreaming;
  const isHistorical = !isLastMessage || (message.role === 'assistant' && !isStreaming);

  // toolResult messages are not rendered directly — they're agent-internal
  if (message.role === 'toolResult') {
    return null;
  }

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div className={`max-w-[80%] space-y-2 ${isUser ? 'items-end' : 'items-start'}`}>
        {isUser ? (
          <UserMessage message={message} />
        ) : (
          <AssistantMessage
            message={message as AssistantMessageType}
            defaultCollapsed={isHistorical}
            sessionId={currentSessionId}
            isStreaming={isActivelyStreaming}
          />
        )}

        <MessageFooter message={message} isUser={isUser} isStreaming={isActivelyStreaming} />
      </div>
    </div>
  );
};

interface MessageFooterProps {
  message: Message;
  isUser: boolean;
  isStreaming: boolean;
}

const MessageFooter: React.FC<MessageFooterProps> = ({ message, isUser, isStreaming }) => {
  const { i18n } = useTranslation();
  const locale = i18n.language === 'zh' ? 'zh-CN' : 'en-US';
  const showTokenUsage = !isUser && message.role === 'assistant' && !isStreaming && message.usage;

  return (
    <div className={`flex flex-col gap-1 mt-1 ${isUser ? 'items-end pr-1' : 'items-start pl-1'}`}>
      {showTokenUsage && message.role === 'assistant' && message.usage && (
        <TokenUsage usage={message.usage} />
      )}

      <div className="text-[11px] text-muted-foreground">
        {formatTimestamp(message.timestamp, locale)}
      </div>
    </div>
  );
};

function formatTimestamp(timestamp: number, locale: string): string {
  return new Date(timestamp).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default MessageItem;
