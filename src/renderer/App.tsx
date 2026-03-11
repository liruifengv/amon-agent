import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore, initSettingsListeners } from './store/settingsStore';
import { useSessionStore } from './store/sessionStore';
import { useChatStore } from './store/chatStore';
import { useSkillsStore } from './store/skillsStore';
import Sidebar from './components/Sidebar/Sidebar';
import ChatView from './components/Chat/ChatView';
import { SkillsView } from './components/Skills';
import Onboarding from './components/Onboarding/Onboarding';
import { Toaster } from './components/ui/sonner';
import ConfirmDialog from './components/ConfirmDialog';

const App: React.FC = () => {
  const { t } = useTranslation();
  const { loadSettings, isLoading: settingsLoading, settings } = useSettingsStore();
  const { loadSessions, isLoading: sessionsLoading, currentSessionId } = useSessionStore();
  const { loadMessages } = useChatStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<'chat' | 'skills'>('chat');

  // 初始化加载设置和会话
  useEffect(() => {
    loadSettings();
    loadSessions();

    // 初始化设置监听器
    const cleanupSettingsListeners = initSettingsListeners();

    // 监听会话相关 push 事件
    const cleanupSessionUpdated = window.push.on('push:sessionUpdated', (session) => {
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === session.id ? session : s
        ),
      }));
    });

    const cleanupSessionCreated = window.push.on('push:sessionCreated', (session) => {
      useSessionStore.setState((state) => {
        // Deduplicate: if already added by IPC response, skip adding again
        const exists = state.sessions.some((s) => s.id === session.id);
        return {
          sessions: exists ? state.sessions : [session, ...state.sessions],
          currentSessionId: session.id,
        };
      });
    });

    const cleanupSessionDeleted = window.push.on('push:sessionDeleted', ({ sessionId }) => {
      useSessionStore.setState((state) => {
        const newSessions = state.sessions.filter((s) => s.id !== sessionId);
        const newCurrentId =
          state.currentSessionId === sessionId
            ? newSessions[0]?.id || null
            : state.currentSessionId;
        return { sessions: newSessions, currentSessionId: newCurrentId };
      });
    });

    // 监听 skills 变更事件，刷新技能列表
    const cleanupSkillsChanged = window.push.on('push:skillsChanged', () => {
      const workspace = useSessionStore.getState().getCurrentWorkspace();
      useSkillsStore.getState().loadSkills(workspace);
    });

    return () => {
      cleanupSettingsListeners();
      cleanupSessionUpdated();
      cleanupSessionCreated();
      cleanupSessionDeleted();
      cleanupSkillsChanged();
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
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        </div>
      </div>
    );
  }

  // 派生状态：检查是否需要显示 onboarding
  const needsOnboarding =
    settings.agent.providerConfigs.length === 0;

  // 显示 onboarding（自动响应设置变化）
  if (needsOnboarding) {
    return (
      <>
        <Onboarding />
        <Toaster position="top-center" />
      </>
    );
  }

  return (
    <div className="h-screen flex bg-sidebar-background">
      {/* 侧边栏 */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        activeView={activeView}
        onNavigate={setActiveView}
      />

      {/* 主内容区 */}
      {activeView === 'chat' ? (
        <ChatView sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)} />
      ) : (
        <SkillsView sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)} />
      )}

      {/* Toast 通知 */}
      <Toaster position="top-center" />
      <ConfirmDialog />
    </div>
  );
};

export default App;
