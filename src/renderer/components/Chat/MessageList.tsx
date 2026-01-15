import React, { useRef, useCallback, useEffect, useImperativeHandle } from 'react';
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
  
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevSessionIdRef = useRef<string | null>(null);
  // 跟踪是否应该自动滚动
  const shouldAutoScrollRef = useRef(true);

  // 获取待处理的请求
  const pendingRequest = currentSessionId ? getPendingRequest(currentSessionId) : null;
  const pendingQuestionRequest = currentSessionId ? getPendingQuestionRequest(currentSessionId) : null;

  // 滚动到底部
  const scrollToBottom = useCallback((instant = false) => {
    const container = containerRef.current;
    if (container) {
      if (instant) {
        container.scrollTop = container.scrollHeight;
      } else {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    }
  }, []);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    scrollToBottom: () => scrollToBottom(false),
  }));

  // 检查是否接近底部
  const checkNearBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return true;
    
    const threshold = 100;
    const isNear = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    return isNear;
  }, []);

  // 处理滚动事件
  const handleScroll = useCallback(() => {
    const isNear = checkNearBottom();
    onNearBottom?.(isNear);
    
    // 更新自动滚动状态：如果用户滚动到底部附近，恢复自动滚动
    shouldAutoScrollRef.current = isNear;
  }, [checkNearBottom, onNearBottom]);

  // 会话切换时立即滚动到底部
  useEffect(() => {
    if (currentSessionId !== prevSessionIdRef.current) {
      prevSessionIdRef.current = currentSessionId;
      shouldAutoScrollRef.current = true;
    }
  }, [currentSessionId]);

  // 使用 MutationObserver 监听内容变化
  useEffect(() => {
    const content = contentRef.current;
    const container = containerRef.current;
    if (!content || !container) return;

    let rafId: number | null = null;
    
    const doScroll = () => {
      if (shouldAutoScrollRef.current) {
        container.scrollTop = container.scrollHeight;
      }
      rafId = null;
    };

    const scheduleScroll = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(doScroll);
      }
    };

    // 监听 DOM 子树变化和属性变化
    const mutationObserver = new MutationObserver(scheduleScroll);
    mutationObserver.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    // 监听内容区域大小变化
    const resizeObserver = new ResizeObserver(scheduleScroll);
    resizeObserver.observe(content);

    // 初始滚动
    scheduleScroll();

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [currentSessionId]);

  // 当有权限请求或问题请求时滚动到底部
  useEffect(() => {
    if (pendingRequest || pendingQuestionRequest) {
      shouldAutoScrollRef.current = true;
      requestAnimationFrame(() => {
        scrollToBottom(true);
      });
    }
  }, [pendingRequest, pendingQuestionRequest, scrollToBottom]);

  return (
    <div 
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900"
    >
      <div ref={contentRef}>
        {/* 消息列表 */}
        {messages.map((message, index) => (
          <div key={message.id} className="max-w-3xl mx-auto px-4 py-2.5">
            <MessageItem message={message} isLastMessage={index === messages.length - 1} />
          </div>
        ))}

        {/* Footer 内容 */}
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
      </div>
    </div>
  );
}) as React.ForwardRefExoticComponent<MessageListProps & React.RefAttributes<MessageListRef>>;

MessageList.displayName = 'MessageList';

export default MessageList;
