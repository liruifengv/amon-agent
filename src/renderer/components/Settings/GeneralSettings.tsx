import React from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { Sun, Moon, Monitor } from 'lucide-react';

const THEMES = [
  {
    id: 'light' as const,
    name: 'Light',
    icon: <Sun className="w-6 h-6" />,
  },
  {
    id: 'dark' as const,
    name: 'Dark',
    icon: <Moon className="w-6 h-6" />,
  },
  {
    id: 'system' as const,
    name: 'System',
    icon: <Monitor className="w-6 h-6" />,
  },
];

// 应用主题到 DOM
function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  const root = document.documentElement;

  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', isDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}

const GeneralSettings: React.FC = () => {
  const { formData, setFormData, saveTheme } = useSettingsStore();

  const handleThemeChange = async (theme: 'light' | 'dark' | 'system') => {
    applyTheme(theme);
    setFormData({ theme });

    // 立即保存主题设置（不影响其他未保存的设置）
    await saveTheme(theme);
  };

  return (
    <div className="space-y-6">
      {/* 主题设置 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
          Theme
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
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                  : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}
              `}
            >
              {theme.icon}
              <span className="text-sm font-medium">{theme.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GeneralSettings;
