import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settingsStore';
import type { ProviderConfig } from '../../types';
import ProviderIcon from '../Settings/ProviderIcon';

const ProviderSelector: React.FC = () => {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { settings, setAgentFormData, saveSettings } = useSettingsStore();
  const { providerConfigs, activeProviderId } = settings.agent;

  const activeProvider = providerConfigs.find(c => c.id === activeProviderId);
  const displayName = activeProvider?.name || activeProviderId || t('common:notConfigured');
  const isDisabled = providerConfigs.length === 0;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleProviderChange = async (provider: ProviderConfig) => {
    setAgentFormData({
      activeProviderId: provider.id,
      activeModelId: provider.modelId || '',
    });
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
            : 'text-foreground border-border hover:bg-accent cursor-pointer'
          }
        `}
        title={providerConfigs.length === 0 ? t('provider.pleaseConfigureProvider') : t('provider.switchProvider')}
      >
        {activeProvider ? (
          <ProviderIcon icon={activeProvider.icon} size={16} />
        ) : (
          <div className="w-4 h-4 rounded bg-muted" />
        )}
        <span className="font-medium max-w-28 truncate">{displayName}</span>
        {activeProvider?.modelId && (
          <span className="text-muted-foreground max-w-24 truncate hidden sm:inline">{activeProvider.modelId}</span>
        )}
        {!isDisabled && (
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {/* Dropdown menu */}
      {open && providerConfigs.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 w-56 bg-popover rounded-lg shadow-lg border border-border py-1 z-50">
          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
            {t('provider.selectProvider')}
          </div>
          {providerConfigs.map((config: ProviderConfig) => (
            <button
              key={config.id}
              onClick={() => handleProviderChange(config)}
              className={`
                w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm cursor-pointer
                hover:bg-accent transition-colors
                ${activeProviderId === config.id ? 'bg-primary/10' : ''}
              `}
            >
              <ProviderIcon icon={config.icon} size={18} />
              <div className="flex-1 min-w-0">
                <div className={`font-medium truncate ${activeProviderId === config.id ? 'text-primary' : 'text-foreground'}`}>
                  {config.name}
                </div>
                {config.modelId && (
                  <div className="text-xs text-muted-foreground truncate">{config.modelId}</div>
                )}
              </div>
              {activeProviderId === config.id && (
                <svg className="w-4 h-4 text-primary shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProviderSelector;
