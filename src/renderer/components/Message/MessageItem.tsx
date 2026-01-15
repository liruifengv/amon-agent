import React from 'react';
import { Message } from '../../types';
import UserMessage from './UserMessage';
import AssistantMessage from './AssistantMessage';
import SystemMessage from './SystemMessage';
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
  const isSystem = message.role === 'system';

  // 系统消息特殊处理
  if (isSystem) {
    return <SystemMessage message={message} />;
  }

  // 历史消息：不是最后一条消息，或者是最后一条但已经完成（不在流式输出中）
  // 只有最后一条且正在流式输出的消息才展开
  const isHistorical = !isLastMessage || !message.isStreaming;

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      {/* 消息内容 */}
      <div className={`max-w-[80%] space-y-2 ${isUser ? 'items-end' : 'items-start'}`}>
        {isUser ? (
          <UserMessage message={message} />
        ) : (
          <AssistantMessage message={message} defaultCollapsed={isHistorical} />
        )}

        {/* 底部信息 */}
        <MessageFooter message={message} isUser={isUser} />
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
}

const MessageFooter: React.FC<MessageFooterProps> = ({ message, isUser }) => {
  const showTokenUsage = !isUser && !message.isStreaming && message.tokenUsage;

  return (
    <div className={`flex flex-col gap-1 mt-1 ${isUser ? 'items-end pr-1' : 'items-start pl-1'}`}>
      {/* Token 用量（仅助手消息且非流式时显示） */}
      {showTokenUsage && message.tokenUsage && <TokenUsage usage={message.tokenUsage} />}

      {/* 时间戳 */}
      <div className="text-[11px] text-gray-400 dark:text-gray-500">
        {formatTimestamp(message.timestamp)}
      </div>
    </div>
  );
};

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default MessageItem;
