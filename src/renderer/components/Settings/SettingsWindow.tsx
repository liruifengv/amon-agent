import React, { useEffect, useState } from 'react';
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
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

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
      label: '通用',
      icon: <Settings className="w-5 h-5" />,
    },
    {
      id: 'provider',
      label: 'Provider',
      icon: <Server className="w-5 h-5" />,
    },
    {
      id: 'agent',
      label: 'Agent',
      icon: <MessageCircle className="w-5 h-5" />,
    },
    {
      id: 'workspace',
      label: '工作空间',
      icon: <Folder className="w-5 h-5" />,
    },
    {
      id: 'skills',
      label: 'Skills',
      icon: <Sparkles className="w-5 h-5" />,
    },
    {
      id: 'shortcuts',
      label: '快捷键',
      icon: <Keyboard className="w-5 h-5" />,
    },
    {
      id: 'about',
      label: '关于',
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
      <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-800">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500 dark:text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-white dark:bg-gray-800">
      {/* 可拖拽的标题栏区域 */}
      <div
        className="absolute top-0 left-0 right-0 h-10 z-10"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* 侧边栏 */}
      <div className="w-48 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-col">
        <div className="h-10" />
        <nav className="flex-1 p-2 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${activeTab === tab.id
                  ? 'bg-primary-500/10 text-primary-500 dark:bg-primary-500/20'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}
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
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <ul className="text-sm text-red-600 dark:text-red-400 space-y-1">
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
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {tabs.find(tab => tab.id === activeTab)?.label}
            </h1>
          </div>

          {renderContent()}
        </div>

        {/* 底部按钮 */}
        {activeTab !== 'about' && activeTab !== 'skills' && (
          <div className="p-4 flex justify-end gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              关闭
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="px-6 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              保存
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsWindow;
