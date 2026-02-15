import React from 'react';
import { useTranslation } from 'react-i18next';
import { Server, Terminal } from 'lucide-react';
import LogoImage from '@/renderer/assets/images/Logo.png';
import { useSettingsStore } from '@/renderer/store/settingsStore';
import { toast } from 'sonner';

const Onboarding: React.FC = () => {
  const { t } = useTranslation('onboarding');
  const { settings } = useSettingsStore();

  const handleConfigureProvider = async () => {
    // 打开设置窗口并直接跳转到供应商页面
    await window.electronAPI.window.openSettings('provider');
  };

  const handleEnableClaudeCode = async () => {
    // 先显示成功通知
    toast.success(t('startVibeCoding'));

    // 延迟更新设置，让 Toast 有时间显示
    setTimeout(async () => {
      // 直接更新设置，触发 SETTINGS_CHANGED 事件
      // App.tsx 会自动检测并隐藏 onboarding
      const newSettings = {
        ...settings,
        agent: {
          ...settings.agent,
          claudeCodeMode: true
        }
      };

      const result = await window.electronAPI.settings.set(newSettings);

      if (!result.success) {
        console.error('Failed to enable Claude Code mode:', result.errors);
        toast.error(t('enableFailed'));
      }
    }, 1500); // 延迟 1.5 秒，让用户看到 Toast
  };

  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 max-w-md text-center px-8">
        {/* Logo */}
        <div className="w-24 h-24 rounded-2xl overflow-hidden flex items-center justify-center">
          <img src={LogoImage} alt="Amon" className="w-full h-full object-contain" />
        </div>

        {/* 欢迎语 */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">{t('welcome')}</h1>
          <p className="text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>

        {/* 按钮 */}
        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={handleConfigureProvider}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Server className="w-5 h-5" />
            {t('configureProvider')}
          </button>

          <button
            onClick={handleEnableClaudeCode}
            className="flex flex-col items-center gap-1 px-6 py-3 border border-border rounded-lg hover:bg-accent transition-colors"
          >
            <div className="flex items-center gap-2 text-foreground">
              <Terminal className="w-5 h-5" />
              <span>{t('enableClaudeCodeMode')}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {t('useLocalClaudeCode')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
