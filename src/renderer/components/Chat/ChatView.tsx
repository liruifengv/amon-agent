import React, { useRef, useState, useCallback, useEffect } from 'react';
import { PanelLeft, SquarePen, MessageSquare, ArrowDown, Folder, ChevronDown, Lock } from 'lucide-react';
import { useSessionStore } from '../../store/sessionStore';
import { useChatStore } from '../../store/chatStore';
import { Button } from '../ui/button';
import MessageList, { MessageListRef } from './MessageList';
import InputArea from './InputArea';
import WorkspaceSelector from './WorkspaceSelector';
import { DEFAULT_WORKSPACE_PATH } from '../../../shared/constants';

interface ChatViewProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

const ChatView: React.FC<ChatViewProps> = ({ sidebarCollapsed, onToggleSidebar }) => {
  const { currentSessionId, sessions, createSession } = useSessionStore();
  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const sessionMessages = useChatStore((state) => state.sessionMessages);
  const messages = currentSessionId ? (sessionMessages[currentSessionId] || []) : [];
  const messageListRef = useRef<MessageListRef>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showWorkspaceSelector, setShowWorkspaceSelector] = useState(false);

  // 检查是否有消息（对话已开始）
  const hasMessages = messages.length > 0;

  // 切换会话时关闭工作空间选择器
  useEffect(() => {
    setShowWorkspaceSelector(false);
  }, [currentSessionId]);

  // 格式化显示路径（简化路径显示）
  const formatPath = (pathStr: string) => {
    // 尝试提取最后两级目录名
    const parts = pathStr.split('/').filter(Boolean);
    if (parts.length > 2) {
      return `.../${parts.slice(-2).join('/')}`;
    }
    return pathStr;
  };

  const workspaceDisplay = currentSession?.workspace
    ? formatPath(currentSession.workspace)
    : DEFAULT_WORKSPACE_PATH;

  const handleScrollToBottom = useCallback(() => {
    messageListRef.current?.scrollToBottom();
  }, []);

  const handleCreateSession = async () => {
    await createSession();
  };

  const handleWorkspaceClick = () => {
    setShowWorkspaceSelector(!showWorkspaceSelector);
  };

  if (!currentSessionId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        {/* 展开按钮 - 侧边栏收起时显示 */}
        {sidebarCollapsed && (
          <div className="absolute top-0 left-0 h-12 drag-region flex items-center gap-1 px-2 pl-20">
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleSidebar}
              className="no-drag h-8 w-8"
              title="展开侧边栏"
            >
              <PanelLeft className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCreateSession}
              className="no-drag h-8 w-8"
              title="新建会话"
            >
              <SquarePen className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            </Button>
          </div>
        )}
        <div className="text-center">
          <MessageSquare className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h2 className="text-xl font-medium text-gray-600 dark:text-gray-300 mb-2">
            开始新对话
          </h2>
          <p className="text-gray-400 dark:text-gray-500">
            选择一个会话或创建新会话开始对话
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
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
              title="展开侧边栏"
            >
              <PanelLeft className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCreateSession}
              className="no-drag h-8 w-8"
              title="新建会话"
            >
              <SquarePen className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            </Button>
          </>
        )}
        <div className="flex-1 flex flex-col items-center justify-center relative">
          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
            {currentSession?.name || '新会话'}
          </h2>
          {/* 工作空间指示器 */}
          <button
            onClick={handleWorkspaceClick}
            className={`no-drag flex items-center gap-1 text-xs transition-colors
                       ${hasMessages
                         ? 'text-gray-400 dark:text-gray-500'
                         : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
            title={hasMessages ? '对话开始后无法更换工作空间' : '点击更换工作空间'}
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
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800
                       border border-gray-200 dark:border-gray-700
                       rounded-full shadow-sm hover:shadow-md
                       text-xs text-gray-600 dark:text-gray-300
                       transition-all duration-200"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            回到底部
          </button>
        </div>
      )}

      {/* 输入区域 */}
      <InputArea />
    </div>
  );
};

export default ChatView;
