import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore, initSettingsListeners } from '../../store/settingsStore';
import GeneralSettings from './GeneralSettings';
import AgentSettings from './AgentSettings';
import ProviderSettings from './ProviderSettings';
import ShortcutsSettings from './ShortcutsSettings';
import WorkspaceSettings from './WorkspaceSettings';
import SkillsSettings from './SkillsSettings';
import AboutSettings from './AboutSettings';
import { Settings, MessageCircle, Info, Keyboard, Folder, Sparkles, Server } from 'lucide-react';

type SettingsTab = 'general' | 'provider' | 'workspace' | 'agent' | 'shortcuts' | 'skills' | 'about';

const SettingsWindow: React.FC = () => {
  const { saveSettings, saveError, isSaving, loadSettings, hasChanges } = useSettingsStore();
  const { t } = useTranslation(['settings', 'common']);

  // 从 URL hash 读取初始 tab，如果没有则默认为 'general'
  const getInitialTab = (): SettingsTab => {
    const hash = window.location.hash.slice(1); // 移除 # 符号
    const validTabs: SettingsTab[] = ['general', 'provider', 'workspace', 'agent', 'shortcuts', 'skills', 'about'];
    return validTabs.includes(hash as SettingsTab) ? (hash as SettingsTab) : 'general';
  };

  const [activeTab, setActiveTab] = useState<SettingsTab>(getInitialTab());

  useEffect(() => {
    loadSettings();

    // 初始化设置监听器
    const cleanupSettingsListeners = initSettingsListeners();

    return () => {
      cleanupSettingsListeners();
    };
  }, []);

  const handleClose = () => {
    window.electronAPI.window.closeSettings();
  };

  const handleSave = async () => {
    await saveSettings();
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'general',
      label: t('settings:tabs.general'),
      icon: <Settings className="w-5 h-5" />,
    },
    {
      id: 'provider',
      label: t('settings:tabs.provider'),
      icon: <Server className="w-5 h-5" />,
    },
    {
      id: 'agent',
      label: t('settings:tabs.agent'),
      icon: <MessageCircle className="w-5 h-5" />,
    },
    {
      id: 'workspace',
      label: t('settings:tabs.workspace'),
      icon: <Folder className="w-5 h-5" />,
    },
    {
      id: 'skills',
      label: t('settings:tabs.skills'),
      icon: <Sparkles className="w-5 h-5" />,
    },
    {
      id: 'shortcuts',
      label: t('settings:tabs.shortcuts'),
      icon: <Keyboard className="w-5 h-5" />,
    },
    {
      id: 'about',
      label: t('settings:tabs.about'),
      icon: <Info className="w-5 h-5" />,
    },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings />;
      case 'provider':
        return <ProviderSettings />;
      case 'workspace':
        return <WorkspaceSettings />;
      case 'agent':
        return <AgentSettings onNavigateToProvider={() => setActiveTab('provider')} />;
      case 'shortcuts':
        return <ShortcutsSettings />;
      case 'skills':
        return <SkillsSettings />;
      case 'about':
        return <AboutSettings />;
      default:
        return null;
    }
  };

  if (useSettingsStore.getState().isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">{t('common:loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-background">
      {/* 可拖拽的标题栏区域 */}
      <div
        className="absolute top-0 left-0 right-0 h-10 z-10"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* 侧边栏 */}
      <div className="w-48 bg-sidebar-background flex flex-col">
        <div className="h-10" />
        <nav className="flex-1 p-2 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                ${activeTab === tab.id
                  ? 'bg-sidebar-accent text-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent'}
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          {/* 错误提示 */}
          {saveError && saveError.length > 0 && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <ul className="text-sm text-destructive space-y-1">
                {saveError.map((error, index) => (
                  <li key={index}>
                    {error.field === '_global' ? error.message : `${error.field}: ${error.message}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 标题 */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-foreground">
              {tabs.find(tab => tab.id === activeTab)?.label}
            </h1>
          </div>

          {renderContent()}
        </div>

        {/* 底部按钮 */}
        {activeTab !== 'about' && activeTab !== 'skills' && activeTab !== 'provider' && (
          <div className="p-4 flex items-center justify-end gap-3">
            {hasChanges && (
              <span className="text-sm text-destructive mr-2">{t('common:unsavedChanges')}</span>
            )}
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-accent transition-colors"
            >
              {t('common:close')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="px-6 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common:save')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsWindow;
