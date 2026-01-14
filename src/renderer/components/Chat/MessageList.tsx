import React, { useRef, useCallback, useEffect, useImperativeHandle } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useChatStore } from '../../store/chatStore';
import { useSessionStore } from '../../store/sessionStore';
import { usePermissionStore } from '../../store/permissionStore';
import { MessageItem } from '../Message';
import PermissionRequest from '../Permission/PermissionRequest';
import AskUserQuestionRequest from '../Permission/AskUserQuestionRequest';

export interface MessageListRef {
  scrollToBottom: () => void;
}

interface MessageListProps {
  onNearBottom?: (isNearBottom: boolean) => void;
}

const MessageList = React.forwardRef<MessageListRef, MessageListProps>(({ onNearBottom }, ref) => {
  const { currentSessionId } = useSessionStore();
  const { getMessages, getSessionError, clearSessionError } = useChatStore();
  const { getPendingRequest, getPendingQuestionRequest } = usePermissionStore();
  const messages = getMessages(currentSessionId);
  const error = getSessionError(currentSessionId);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // 获取待处理的请求
  const pendingRequest = currentSessionId ? getPendingRequest(currentSessionId) : null;
  const pendingQuestionRequest = currentSessionId ? getPendingQuestionRequest(currentSessionId) : null;

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: messages.length - 1,
      behavior: 'smooth',
      align: 'end',
    });
  }, [messages.length]);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    scrollToBottom,
  }));

  // 当消息变化时滚动到底部
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom]);

  // 当有权限请求或问题请求时也滚动到底部
  useEffect(() => {
    if (pendingRequest || pendingQuestionRequest) {
      setTimeout(scrollToBottom, 100);
    }
  }, [pendingRequest, pendingQuestionRequest, scrollToBottom]);

  return (
    <div className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900">
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        followOutput="smooth"
        initialTopMostItemIndex={messages.length - 1}
        itemContent={(index, message) => (
          <div className="max-w-3xl mx-auto px-4 py-2.5">
            <MessageItem key={message.id} message={message} />
          </div>
        )}
        rangeChanged={(range) => {
          // 判断是否接近底部（最后5个item内）
          const isNearBottom = range.endIndex >= messages.length - 5;
          onNearBottom?.(isNearBottom);
        }}
        components={{
          Footer: () => (
            <div className="max-w-3xl mx-auto px-4 pb-6">
              {/* 权限请求 - 待处理 */}
              {pendingRequest && (
                <PermissionRequest request={pendingRequest} />
              )}

              {/* 用户问题请求 - 待处理 */}
              {pendingQuestionRequest && (
                <AskUserQuestionRequest request={pendingQuestionRequest} />
              )}

              {/* 错误提示 */}
              {error && (
                <div className="mt-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl relative">
                  <button
                    onClick={() => currentSessionId && clearSessionError(currentSessionId)}
                    className="absolute top-2 right-2 p-1 text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300 rounded-md hover:bg-red-100 dark:hover:bg-red-800/30 transition-colors"
                    aria-label="关闭错误提示"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <p className="text-sm text-red-600 dark:text-red-400 pr-6 whitespace-pre-wrap">{error}</p>
                </div>
              )}
            </div>
          ),
        }}
        className="h-full"
      />
    </div>
  );
}) as React.ForwardRefExoticComponent<MessageListProps & React.RefAttributes<MessageListRef>>;

MessageList.displayName = 'MessageList';

export default MessageList;
