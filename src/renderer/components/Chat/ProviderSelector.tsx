import React, { useState, useRef, useEffect } from 'react';
import { Server, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settingsStore';

const ProviderSelector: React.FC = () => {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { settings, setAgentFormData, saveSettings } = useSettingsStore();
  const { providers, activeProviderId, claudeCodeMode } = settings.agent;
  const activeProvider = providers.find(p => p.id === activeProviderId);
  const displayName = claudeCodeMode
    ? 'Claude Code'
    : (activeProvider?.name || t('common:notConfigured'));

  const isDisabled = claudeCodeMode || providers.length === 0;

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleProviderChange = async (id: string) => {
    if (claudeCodeMode) return;
    setAgentFormData({ activeProviderId: id });
    await saveSettings();
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !isDisabled && setOpen(!open)}
        disabled={isDisabled}
        className={`
          flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs border
          transition-colors duration-150
          ${isDisabled
            ? 'text-muted-foreground cursor-not-allowed border-border'
            : 'text-foreground border-border hover:bg-accent'
          }
        `}
        title={claudeCodeMode ? t('provider.claudeCodeMode') : (providers.length === 0 ? t('provider.pleaseConfigureProvider') : t('provider.switchProvider'))}
      >
        <Server className="w-4 h-4" />
        <span className="font-medium max-w-24 truncate">{displayName}</span>
        {!isDisabled && (
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {/* 下拉菜单 */}
      {open && !claudeCodeMode && providers.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 w-48 bg-popover rounded-lg shadow-lg border border-border py-1 z-50">
          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
            {t('provider.selectProvider')}
          </div>
          {providers.map((provider) => (
            <button
              key={provider.id}
              onClick={() => handleProviderChange(provider.id)}
              className={`
                w-full flex items-center gap-2 px-3 py-2 text-left text-sm
                hover:bg-accent
                ${activeProviderId === provider.id ? 'bg-primary/10 text-primary' : 'text-foreground'}
              `}
            >
              <Server className={`w-4 h-4 ${activeProviderId === provider.id ? 'text-primary' : 'text-muted-foreground'}`} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{provider.name}</div>
                <div className="text-xs text-muted-foreground truncate">{provider.model}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProviderSelector;
