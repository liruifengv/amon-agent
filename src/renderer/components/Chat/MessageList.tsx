import React, { useRef, useCallback, useEffect, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../store/chatStore';
import { useSessionStore } from '../../store/sessionStore';
import { usePermissionStore } from '../../store/permissionStore';
import { MessageItem } from '../Message';
import PermissionRequest from '../Permission/PermissionRequest';
import AskUserQuestionRequest from '../Permission/AskUserQuestionRequest';
import PlanApprovalBlock from '../Message/ContentBlocks/PlanApprovalBlock';

export interface MessageListRef {
  scrollToBottom: () => void;
  enableAutoScroll: () => void;
}

interface MessageListProps {
  onNearBottom?: (isNearBottom: boolean) => void;
}

const MessageList = React.forwardRef<MessageListRef, MessageListProps>(({ onNearBottom }, ref) => {
  const { t } = useTranslation('message');
  const { currentSessionId } = useSessionStore();
  const { getMessages, getSessionError, clearSessionError } = useChatStore();
  const { getPendingRequest, getPendingQuestionRequest, getPendingPlanApprovalRequest } = usePermissionStore();
  const messages = getMessages(currentSessionId);
  const error = getSessionError(currentSessionId);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevSessionIdRef = useRef<string | null>(null);
  // 跟踪是否应该自动滚动
  const shouldAutoScrollRef = useRef(true);
  // 跟踪上一次滚动位置，用于判断滚动方向
  const lastScrollTopRef = useRef(0);
  // 标记是否是程序触发的滚动
  const isProgrammaticScrollRef = useRef(false);

  // 获取待处理的请求
  const pendingRequest = currentSessionId ? getPendingRequest(currentSessionId) : null;
  const pendingQuestionRequest = currentSessionId ? getPendingQuestionRequest(currentSessionId) : null;
  const pendingPlanApprovalRequest = currentSessionId ? getPendingPlanApprovalRequest(currentSessionId) : null;

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
    enableAutoScroll: () => {
      shouldAutoScrollRef.current = true;
      scrollToBottom(true);
    },
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
    const container = containerRef.current;
    if (!container) return;

    const currentScrollTop = container.scrollTop;
    const isNear = checkNearBottom();

    // 通知父组件
    onNearBottom?.(isNear);

    // 只有用户主动向上滚动时才关闭自动滚动
    // 排除程序触发的滚动和向下滚动
    if (!isProgrammaticScrollRef.current && currentScrollTop < lastScrollTopRef.current) {
      // 用户向上滚动，关闭自动滚动
      shouldAutoScrollRef.current = false;
    } else if (isNear) {
      // 用户滚动到底部附近，恢复自动滚动
      shouldAutoScrollRef.current = true;
    }

    lastScrollTopRef.current = currentScrollTop;
    isProgrammaticScrollRef.current = false;
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
        isProgrammaticScrollRef.current = true;
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
    if (pendingRequest || pendingQuestionRequest || pendingPlanApprovalRequest) {
      shouldAutoScrollRef.current = true;
      requestAnimationFrame(() => {
        scrollToBottom(true);
      });
    }
  }, [pendingRequest, pendingQuestionRequest, pendingPlanApprovalRequest, scrollToBottom]);

  return (
    <div 
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto bg-background"
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

          {/* 计划审批请求 - 待处理 */}
          {pendingPlanApprovalRequest && (
            <div className="mt-3">
              <PlanApprovalBlock pendingRequest={pendingPlanApprovalRequest} />
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="mt-3 p-4 bg-destructive/10 border border-destructive/30 rounded-xl relative">
              <button
                onClick={() => currentSessionId && clearSessionError(currentSessionId)}
                className="absolute top-2 right-2 p-1 text-destructive/70 hover:text-destructive rounded-md hover:bg-destructive/10 transition-colors"
                aria-label={t('closeError')}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <p className="text-sm text-destructive pr-6 whitespace-pre-wrap">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}) as React.ForwardRefExoticComponent<MessageListProps & React.RefAttributes<MessageListRef>>;

MessageList.displayName = 'MessageList';

export default MessageList;
