import React, { useEffect, useState, useRef } from 'react';
import { useSettingsStore, initSettingsListeners } from './store/settingsStore';
import { useSessionStore } from './store/sessionStore';
import { useChatStore } from './store/chatStore';
import Sidebar from './components/Sidebar/Sidebar';
import ChatView from './components/Chat/ChatView';

const App: React.FC = () => {
  const { loadSettings, isLoading: settingsLoading } = useSettingsStore();
  const { loadSessions, isLoading: sessionsLoading, currentSessionId } = useSessionStore();
  const { loadMessages, setLoadingStates } = useChatStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 使用 ref 保持回调引用稳定，避免 StrictMode 重复注册
  const handleNewSessionRef = useRef<(() => void) | null>(null);
  const handleSessionUpdatedRef = useRef<((session: { id: string; name: string }) => void) | null>(null);
  const handleCliSessionRef = useRef<((data: { sessionId: string }) => void) | null>(null);

  // 初始化加载设置和会话
  useEffect(() => {
    loadSettings();
    loadSessions();

    // 初始化加载状态
    window.electronAPI.session.getLoadingStates().then(states => {
      setLoadingStates(states);
    });

    // 初始化设置监听器
    const cleanupSettingsListeners = initSettingsListeners();

    // 监听会话更新事件（如标题更新）- 只注册一次
    if (!handleSessionUpdatedRef.current) {
      handleSessionUpdatedRef.current = (session: { id: string; name: string }) => {
        useSessionStore.setState((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === session.id ? { ...s, name: session.name } : s
          ),
        }));
      };
      window.electronAPI.session.onUpdated(handleSessionUpdatedRef.current);
    }

    // 监听 CLI 创建会话事件 - 只注册一次
    if (!handleCliSessionRef.current) {
      handleCliSessionRef.current = (data: { sessionId: string }) => {
        // 重新加载会话列表并切换到 CLI 创建的会话
        useSessionStore.getState().loadSessions().then(() => {
          useSessionStore.setState({ currentSessionId: data.sessionId });
        });
      };
      window.electronAPI.cli?.onSessionCreated(handleCliSessionRef.current);
    }

    return () => {
      cleanupSettingsListeners();
    };
  }, []);

  // 监听快捷键事件 - 只在组件挂载时注册一次
  useEffect(() => {
    // 只注册一次，避免 StrictMode 重复注册
    if (!handleNewSessionRef.current) {
      handleNewSessionRef.current = async () => {
        try {
          await useSessionStore.getState().createSession();
        } catch (error) {
          console.error('Failed to create session via shortcut:', error);
        }
      };
      window.electronAPI.shortcuts.onNewSession(handleNewSessionRef.current);
    }

    return () => {
      // 不在这里清理，因为 StrictMode 会导致重复注册
    };
  }, []);

  // 当 currentSessionId 变化时加载消息
  useEffect(() => {
    if (currentSessionId) {
      loadMessages(currentSessionId);
    }
  }, [currentSessionId, loadMessages]);

  // 加载状态
  if (settingsLoading || sessionsLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-800">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500 dark:text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-white dark:bg-gray-800">
      {/* 侧边栏 */}
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      {/* 侧边栏和主聊天区域之间的分隔线 */}
      <div className="w-px bg-gray-200 dark:bg-gray-700" />

      {/* 聊天主区域 */}
      <ChatView sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)} />
    </div>
  );
};

export default App;
