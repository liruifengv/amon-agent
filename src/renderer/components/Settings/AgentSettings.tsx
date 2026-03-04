import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settingsStore';

import ProviderIcon from '../Settings/ProviderIcon';

const THINKING_LEVELS = [
  { value: 'off', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'X-High' },
] as const;

interface AgentSettingsProps {
  onNavigateToProvider?: () => void;
}

const AgentSettings: React.FC<AgentSettingsProps> = ({ onNavigateToProvider }) => {
  const { formData, setAgentFormData, clearSaveError } = useSettingsStore();
  const { t } = useTranslation(['settings', 'common']);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { activeProviderId, thinkingLevel, maxTurns, providerConfigs } = formData.agent;

  const configuredProviders = (providerConfigs || [])
    .filter(c => c.apiKey?.trim());

  const activeProvider = configuredProviders.find(c => c.id === activeProviderId);

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

  const handleProviderChange = (providerId: string) => {
    clearSaveError();
    const selected = providerConfigs?.find(c => c.id === providerId);
    setAgentFormData({
      activeProviderId: providerId,
      activeModelId: selected?.modelId || '',
    });
    setOpen(false);
  };

  const handleThinkingLevelChange = (level: string) => {
    clearSaveError();
    setAgentFormData({ thinkingLevel: level as typeof thinkingLevel });
  };

  const handleMaxTurnsChange = (value: string) => {
    clearSaveError();
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) {
      setAgentFormData({ maxTurns: num });
    }
  };

  const hasNoProviders = configuredProviders.length === 0;

  return (
    <div className="space-y-6">
      {/* No provider configured warning */}
      {hasNoProviders && (
        <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg">
          <p className="text-sm text-warning">
            {t('settings:agent.noProviderConfigured')}
          </p>
          <button
            onClick={onNavigateToProvider}
            className="mt-2 text-xs text-primary hover:text-primary/80"
          >
            {t('settings:agent.goToProviderSettings')}
          </button>
        </div>
      )}

      {/* Provider selection - custom dropdown with icons */}
      {!hasNoProviders && (
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          {t('settings:agent.provider')}
        </label>
        <div className="relative" ref={ref}>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg border border-border
                       bg-background text-foreground hover:border-foreground/30
                       focus:ring-2 focus:ring-primary focus:border-primary
                       outline-none transition-colors cursor-pointer"
          >
            {activeProvider ? (
              <>
                <ProviderIcon icon={activeProvider.icon} size={18} />
                <div className="flex-1 text-left min-w-0">
                  <span className="font-medium">{activeProvider.name}</span>
                  {activeProvider.modelId && (
                    <span className="text-muted-foreground ml-2 text-xs">{activeProvider.modelId}</span>
                  )}
                </div>
              </>
            ) : (
              <span className="text-muted-foreground">{activeProviderId || t('common:notConfigured')}</span>
            )}
            <svg className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          {open && configuredProviders.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg py-1 max-h-60 overflow-y-auto">
              {configuredProviders.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => handleProviderChange(provider.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors cursor-pointer ${
                    activeProviderId === provider.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-accent'
                  }`}
                >
                  <ProviderIcon icon={provider.icon} size={18} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{provider.name}</div>
                    {provider.modelId && (
                      <div className="text-xs text-muted-foreground truncate">{provider.modelId}</div>
                    )}
                  </div>
                  {activeProviderId === provider.id && (
                    <svg className="w-4 h-4 text-primary shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Thinking Level */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          {t('settings:agent.thinkingLevel')}
        </label>
        <div className="flex gap-2">
          {THINKING_LEVELS.map((level) => (
            <button
              key={level.value}
              onClick={() => handleThinkingLevelChange(level.value)}
              className={`
                flex-1 px-3 py-2 text-sm rounded-lg border-2 transition-all duration-150
                ${thinkingLevel === level.value
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border text-muted-foreground hover:bg-accent'}
              `}
            >
              {t(`settings:agent.thinking_${level.value}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Max Turns */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          {t('settings:agent.maxTurns')}
        </label>
        <input
          type="number"
          value={maxTurns}
          onChange={(e) => handleMaxTurnsChange(e.target.value)}
          min={1}
          max={200}
          className="w-24 px-3 py-2 text-sm border border-border rounded-lg
                     bg-background text-foreground
                     focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {t('settings:agent.maxTurnsHint')}
        </p>
      </div>

      {/* Exa API Key */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          {t('settings:agent.exaApiKey')}
        </label>
        <input
          type="password"
          value={formData.agent.exaApiKey || ''}
          onChange={(e) => {
            clearSaveError();
            setAgentFormData({ exaApiKey: e.target.value });
          }}
          placeholder="(optional)"
          className="w-full px-3 py-2 text-sm border border-border rounded-lg
                     bg-background text-foreground
                     focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {t('settings:agent.exaApiKeyHint')}
        </p>
      </div>
    </div>
  );
};

export default AgentSettings;
