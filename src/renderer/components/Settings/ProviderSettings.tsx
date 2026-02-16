import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settingsStore';
import { Key, Globe, Eye, EyeOff, CheckCircle, Plus, Trash2, ChevronDown } from 'lucide-react';
import type { ProviderConfig } from '../../types';

/** 当前支持的 provider 列表 */
const SUPPORTED_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'google', name: 'Google Gemini' },
] as const;

const PROVIDER_NAME_MAP = Object.fromEntries(
  SUPPORTED_PROVIDERS.map(p => [p.id, p.name])
);

const ProviderSettings: React.FC = () => {
  const { formData, setAgentFormData, clearSaveError, saveSettings } = useSettingsStore();
  const { t } = useTranslation(['settings', 'common']);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [showAddDropdown, setShowAddDropdown] = useState(false);

  const providerConfigs = formData.agent.providerConfigs || [];
  const activeProvider = formData.agent.activeProvider;

  // 已添加的 provider ID 列表
  const configuredProviderIds = providerConfigs.map(c => c.provider);

  // 还没添加的 provider
  const unconfiguredProviders = SUPPORTED_PROVIDERS.filter(
    p => !configuredProviderIds.includes(p.id)
  );

  const getConfig = (providerId: string): ProviderConfig | undefined => {
    return providerConfigs.find(c => c.provider === providerId);
  };

  const getProviderName = (providerId: string): string => {
    return PROVIDER_NAME_MAP[providerId] || providerId;
  };

  const updateProviderConfig = (providerId: string, updates: Partial<ProviderConfig>) => {
    clearSaveError();
    const existing = providerConfigs.find(c => c.provider === providerId);
    let newConfigs: ProviderConfig[];

    if (existing) {
      newConfigs = providerConfigs.map(c =>
        c.provider === providerId ? { ...c, ...updates } : c
      );
    } else {
      newConfigs = [...providerConfigs, { provider: providerId, apiKey: '', ...updates }];
    }

    setAgentFormData({ providerConfigs: newConfigs });
  };

  const handleAddProvider = (providerId: string) => {
    updateProviderConfig(providerId, { apiKey: '' });
    setShowAddDropdown(false);
  };

  const handleRemoveProvider = async (providerId: string) => {
    clearSaveError();
    const newConfigs = providerConfigs.filter(c => c.provider !== providerId);
    setAgentFormData({ providerConfigs: newConfigs });
    setTimeout(() => saveSettings(), 0);
  };

  const handleApiKeyChange = (providerId: string, apiKey: string) => {
    updateProviderConfig(providerId, { apiKey });
  };

  const handleBaseUrlChange = (providerId: string, baseUrl: string) => {
    updateProviderConfig(providerId, { baseUrl: baseUrl || undefined });
  };

  const handleSaveProvider = async () => {
    clearSaveError();
    await saveSettings();
  };

  const toggleKeyVisibility = (providerId: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Description */}
      <div>
        <p className="text-xs text-muted-foreground">
          {t('settings:provider.providerConfigDesc')}
        </p>
      </div>

      {/* Configured provider list */}
      <div className="space-y-3">
        {configuredProviderIds.map((providerId) => {
          const config = getConfig(providerId);
          const isActive = activeProvider === providerId;
          const hasKey = !!config?.apiKey?.trim();

          return (
            <div
              key={providerId}
              className={`p-4 rounded-lg border transition-colors ${
                isActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-muted'
              }`}
            >
              {/* Provider header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {getProviderName(providerId)}
                  </span>
                  {isActive && hasKey && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs bg-primary/20 text-primary rounded">
                      <CheckCircle className="w-3 h-3" />
                      {t('settings:provider.active')}
                    </span>
                  )}
                  {hasKey && !isActive && (
                    <span className="text-xs text-success">
                      {t('settings:provider.configured')}
                    </span>
                  )}
                </div>
                {!isActive && (
                  <button
                    type="button"
                    onClick={() => handleRemoveProvider(providerId)}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* API Key input */}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Key className="w-3 h-3" />
                  API Key
                </label>
                <div className="flex-1 relative">
                  <input
                    type={visibleKeys.has(providerId) ? 'text' : 'password'}
                    value={config?.apiKey || ''}
                    onChange={(e) => handleApiKeyChange(providerId, e.target.value)}
                    onBlur={handleSaveProvider}
                    placeholder={`${getProviderName(providerId)} API Key`}
                    className="w-full px-3 py-2 pr-10 text-sm border border-border rounded-lg
                               bg-background text-foreground
                               placeholder-muted-foreground
                               focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => toggleKeyVisibility(providerId)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1
                               text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {visibleKeys.has(providerId) ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Base URL (optional) */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Globe className="w-3 h-3" />
                    Base URL
                    <span className="text-muted-foreground/60">({t('common:optional')})</span>
                  </label>
                  <input
                    type="text"
                    value={config?.baseUrl || ''}
                    onChange={(e) => handleBaseUrlChange(providerId, e.target.value)}
                    onBlur={handleSaveProvider}
                    placeholder={t('settings:provider.baseUrlPlaceholder')}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg
                               bg-background text-foreground
                               placeholder-muted-foreground
                               focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          );
        })}

        {/* Empty state */}
        {configuredProviderIds.length === 0 && (
          <div className="p-6 rounded-lg border border-dashed border-border text-center">
            <p className="text-sm text-muted-foreground">
              {t('settings:provider.providerHint1New')}
            </p>
          </div>
        )}
      </div>

      {/* Add provider button + dropdown */}
      {unconfiguredProviders.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAddDropdown(!showAddDropdown)}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-border
                       rounded-lg text-muted-foreground hover:text-foreground hover:border-foreground/30
                       transition-colors w-full justify-center"
          >
            <Plus className="w-4 h-4" />
            Add Provider
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAddDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showAddDropdown && (
            <div className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto
                            bg-background border border-border rounded-lg shadow-lg">
              {unconfiguredProviders.map(provider => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => handleAddProvider(provider.id)}
                  className="w-full px-3 py-2 text-sm text-left text-foreground
                             hover:bg-accent transition-colors"
                >
                  {provider.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hints */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>{t('settings:provider.providerHint2New')}</p>
      </div>
    </div>
  );
};

export default ProviderSettings;
