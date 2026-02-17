import React from 'react';
import { useTranslation } from 'react-i18next';
import { Message, AssistantMessage as AssistantMessageType } from '../../types';
import { useChatStore } from '../../store/chatStore';
import { useSessionStore } from '../../store/sessionStore';
import UserMessage from './UserMessage';
import AssistantMessage from './AssistantMessage';
import TokenUsage from './TokenUsage';

export interface MessageItemProps {
  message: Message;
  /** Whether this is the last message in the list (used for collapse state) */
  isLastMessage?: boolean;
}

/**
 * 消息项组件 - 根据角色分发渲染
 */
const MessageItem: React.FC<MessageItemProps> = ({ message, isLastMessage = false }) => {
  const isUser = message.role === 'user';
  const { currentSessionId } = useSessionStore();
  const isStreaming = useChatStore((state) => state.isSessionLoading(currentSessionId));

  // 只有最后一条消息才传递流式状态，避免历史消息也显示"工作中"
  const isActivelyStreaming = isLastMessage && isStreaming;

  // 历史消息：不是最后一条消息，或者是最后一条但已经完成（不在流式输出中）
  // 只有最后一条且正在流式输出的消息才展开
  const isHistorical = !isLastMessage || (message.role === 'assistant' && !isStreaming);

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      {/* 消息内容 */}
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

        {/* 底部信息 */}
        <MessageFooter message={message} isUser={isUser} isStreaming={isActivelyStreaming} />
      </div>
    </div>
  );
};

/**
 * 消息底部信息：时间戳和 Token 用量
 */
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
      {/* Token 用量（仅助手消息且非流式时显示） */}
      {showTokenUsage && message.role === 'assistant' && message.usage && (
        <TokenUsage usage={message.usage} />
      )}

      {/* 时间戳 */}
      <div className="text-[11px] text-muted-foreground">
        {formatTimestamp(message.timestamp, locale)}
      </div>
    </div>
  );
};

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp: number, locale: string): string {
  return new Date(timestamp).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default MessageItem;
