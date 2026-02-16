import React, { useState, useRef, useEffect } from 'react';
import { Server, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settingsStore';
import type { ProviderConfig } from '../../types';

/** Provider display names */
const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  xai: 'xAI',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  mistral: 'Mistral',
  minimax: 'MiniMax',
  'kimi-coding': 'Kimi',
};

const ProviderSelector: React.FC = () => {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { settings, setAgentFormData, saveSettings } = useSettingsStore();
  const { providerConfigs, activeProviderId } = settings.agent;

  const getDisplayName = (providerId: string): string => {
    return PROVIDER_NAMES[providerId] || providerId;
  };

  const displayName = activeProviderId
    ? getDisplayName(activeProviderId)
    : t('common:notConfigured');

  const isDisabled = providerConfigs.length === 0;

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

  const handleProviderChange = async (provider: string) => {
    setAgentFormData({ activeProviderId: provider });
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
        title={providerConfigs.length === 0 ? t('provider.pleaseConfigureProvider') : t('provider.switchProvider')}
      >
        <Server className="w-4 h-4" />
        <span className="font-medium max-w-24 truncate">{displayName}</span>
        {!isDisabled && (
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {/* 下拉菜单 */}
      {open && providerConfigs.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 w-48 bg-popover rounded-lg shadow-lg border border-border py-1 z-50">
          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
            {t('provider.selectProvider')}
          </div>
          {providerConfigs.map((config: ProviderConfig) => (
            <button
              key={config.id}
              onClick={() => handleProviderChange(config.id)}
              className={`
                w-full flex items-center gap-2 px-3 py-2 text-left text-sm
                hover:bg-accent
                ${activeProviderId === config.id ? 'bg-primary/10 text-primary' : 'text-foreground'}
              `}
            >
              <Server className={`w-4 h-4 ${activeProviderId === config.id ? 'text-primary' : 'text-muted-foreground'}`} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{getDisplayName(config.id)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProviderSelector;
