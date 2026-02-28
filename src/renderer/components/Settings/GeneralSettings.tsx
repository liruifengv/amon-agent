import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore, applyTheme } from '../../store/settingsStore';
import { Sun, Moon, Monitor, Languages, AlignCenter, AlignJustify } from 'lucide-react';

const LANGUAGES = [
  { id: 'en' as const, label: 'English' },
  { id: 'zh' as const, label: '中文' },
];

const GeneralSettings: React.FC = () => {
  const { formData, saveTheme, saveLanguage, saveChatWidth } = useSettingsStore();
  const { t, i18n } = useTranslation('settings');

  const THEMES = [
    {
      id: 'light' as const,
      name: t('general.themeLight'),
      icon: <Sun className="w-6 h-6" />,
    },
    {
      id: 'dark' as const,
      name: t('general.themeDark'),
      icon: <Moon className="w-6 h-6" />,
    },
    {
      id: 'system' as const,
      name: t('general.themeSystem'),
      icon: <Monitor className="w-6 h-6" />,
    },
  ];

  const handleThemeChange = async (theme: 'light' | 'dark' | 'system') => {
    applyTheme(theme);
    await saveTheme(theme);
  };

  const handleLanguageChange = async (language: 'en' | 'zh') => {
    i18n.changeLanguage(language);
    await saveLanguage(language);
  };

  const handleChatWidthChange = async (chatWidth: 'narrow' | 'wide') => {
    await saveChatWidth(chatWidth);
  };

  const CHAT_WIDTHS = [
    {
      id: 'narrow' as const,
      name: t('general.chatWidthNarrow'),
      icon: <AlignCenter className="w-5 h-5" />,
    },
    {
      id: 'wide' as const,
      name: t('general.chatWidthWide'),
      icon: <AlignJustify className="w-5 h-5" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* 主题设置 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-3">
          {t('general.theme')}
        </label>
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => handleThemeChange(theme.id)}
              className={`
                flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer
                border-2 transition-all duration-150
                ${formData.theme === theme.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-accent'}
              `}
            >
              {theme.icon}
              <span className="text-sm font-medium">{theme.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 语言设置 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-3">
          {t('general.language')}
        </label>
        <div className="grid grid-cols-2 gap-3">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              onClick={() => handleLanguageChange(lang.id)}
              className={`
                flex items-center justify-center gap-2 p-4 rounded-xl cursor-pointer
                border-2 transition-all duration-150
                ${formData.language === lang.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-accent'}
              `}
            >
              <Languages className="w-5 h-5" />
              <span className="text-sm font-medium">{lang.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 聊天宽度设置 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-3">
          {t('general.chatWidth')}
        </label>
        <div className="grid grid-cols-2 gap-3">
          {CHAT_WIDTHS.map((width) => (
            <button
              key={width.id}
              onClick={() => handleChatWidthChange(width.id)}
              className={`
                flex items-center justify-center gap-2 p-4 rounded-xl cursor-pointer
                border-2 transition-all duration-150
                ${formData.chatWidth === width.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-accent'}
              `}
            >
              {width.icon}
              <span className="text-sm font-medium">{width.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GeneralSettings;
