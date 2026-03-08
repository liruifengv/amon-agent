import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { PanelLeft, SquarePen, MessageSquare, ArrowDown, Folder, ChevronDown, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '../../store/sessionStore';
import { useChatStore } from '../../store/chatStore';
import { Button } from '../ui/button';
import MessageList, { MessageListRef } from './MessageList';
import InputArea from './InputArea';
import WorkspaceSelector from './WorkspaceSelector';
import { DEFAULT_WORKSPACE_PATH } from '../../../shared/constants';
import { shortenPath } from '../../utils/path';

interface ChatViewProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

const ChatView: React.FC<ChatViewProps> = ({ sidebarCollapsed, onToggleSidebar }) => {
  const { t } = useTranslation('chat');
  const { currentSessionId, sessions, createSession } = useSessionStore();
  const currentSession = sessions.find((s) => s.id === currentSessionId);
  
  // 获取当前会话的消息
  const sessionMessages = useChatStore((state) => state.sessionMessages);
  const messages = currentSessionId ? sessionMessages[currentSessionId] || [] : [];
  
  const messageListRef = useRef<MessageListRef>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showWorkspaceSelector, setShowWorkspaceSelector] = useState(false);

  // 检查是否有消息（对话已开始）
  const hasMessages = messages.length > 0;

  // 切换会话时重置状态
  useEffect(() => {
    setShowWorkspaceSelector(false);
    setIsNearBottom(true);
  }, [currentSessionId]);

  const workspaceDisplay = useMemo(
    () => (currentSession?.workspace ? shortenPath(currentSession.workspace) : DEFAULT_WORKSPACE_PATH),
    [currentSession?.workspace]
  );

  const handleScrollToBottom = useCallback(() => {
    messageListRef.current?.scrollToBottom();
  }, []);

  const handleMessageSent = useCallback(() => {
    messageListRef.current?.enableAutoScroll();
  }, []);

  const handleCreateSession = async () => {
    await createSession();
  };

  const handleWorkspaceClick = () => {
    setShowWorkspaceSelector(!showWorkspaceSelector);
  };

  if (!currentSessionId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        {/* 展开按钮 - 侧边栏收起时显示 */}
        {sidebarCollapsed && (
          <div className="absolute top-0 left-0 h-12 drag-region flex items-center gap-1 px-2 pl-20">
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleSidebar}
              className="no-drag h-8 w-8"
              title={t('expandSidebar')}
            >
              <PanelLeft className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCreateSession}
              className="no-drag h-8 w-8"
              title={t('newSession')}
            >
              <SquarePen className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        )}
        <div className="text-center">
          <MessageSquare className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-medium text-muted-foreground mb-2">
            {t('startNewChat')}
          </h2>
          <p className="text-muted-foreground mb-6">
            {t('selectOrCreateSession')}
          </p>
          <button
            onClick={handleCreateSession}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <SquarePen className="w-4 h-4" />
            {t('newSession')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* 会话标题和工作空间 */}
      <div className="h-14 drag-region flex items-center px-4">
        {/* 展开按钮 - 侧边栏收起时显示 */}
        {sidebarCollapsed && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleSidebar}
              className="no-drag h-8 w-8 ml-16"
              title={t('expandSidebar')}
            >
              <PanelLeft className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCreateSession}
              className="no-drag h-8 w-8"
              title={t('newSession')}
            >
              <SquarePen className="h-4 w-4 text-muted-foreground" />
            </Button>
          </>
        )}
        <div className="flex-1 flex flex-col items-center justify-center relative">
          <h2 className="text-sm font-medium text-foreground truncate">
            {currentSession?.title || t('newSession')}
          </h2>
          {/* 工作空间指示器 */}
          <button
            onClick={handleWorkspaceClick}
            className={`no-drag flex items-center gap-1 text-xs transition-colors
                       ${hasMessages
                         ? 'text-muted-foreground'
                         : 'text-muted-foreground hover:text-foreground'}`}
            title={hasMessages ? t('workspace.cannotChangeAfterStart') : undefined}
          >
            <Folder className="h-3 w-3" />
            <span className="truncate max-w-[200px]">{workspaceDisplay}</span>
            {hasMessages ? (
              <Lock className="h-3 w-3" />
            ) : (
              <ChevronDown className={`h-3 w-3 transition-transform ${showWorkspaceSelector ? 'rotate-180' : ''}`} />
            )}
          </button>
          {/* 工作空间选择器 */}
          {showWorkspaceSelector && currentSessionId && (
            <WorkspaceSelector
              sessionId={currentSessionId}
              currentWorkspace={currentSession?.workspace}
              onClose={() => setShowWorkspaceSelector(false)}
            />
          )}
        </div>
        {/* 占位，保持标题居中 */}
        {sidebarCollapsed && <div className="w-16 h-8 ml-16" />}
      </div>

      {/* 消息列表 */}
      <MessageList ref={messageListRef} onNearBottom={setIsNearBottom} />

      {/* 滚动到底部按钮 - 仅在未接近底部时显示 */}
      {!isNearBottom && (
        <div className="flex justify-center pb-2">
          <button
            onClick={handleScrollToBottom}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card
                       border border-border
                       rounded-full shadow-sm hover:shadow-md
                       text-xs text-muted-foreground
                       transition-all duration-200"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            {t('scrollToBottom')}
          </button>
        </div>
      )}

      {/* 输入区域 */}
      <InputArea onMessageSent={handleMessageSent} />
    </div>
  );
};

export default ChatView;
