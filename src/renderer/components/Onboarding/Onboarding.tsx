import React from 'react';
import { useTranslation } from 'react-i18next';
import { Server } from 'lucide-react';
import LogoImage from '@/renderer/assets/images/Logo.png';
import { useSettingsStore } from '@/renderer/store/settingsStore';

const Onboarding: React.FC = () => {
  const { t } = useTranslation('onboarding');
  const { settings } = useSettingsStore();

  const handleConfigureProvider = async () => {
    // 打开设置窗口并直接跳转到供应商页面
    await window.ipc.system.openSettings('provider');
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
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
