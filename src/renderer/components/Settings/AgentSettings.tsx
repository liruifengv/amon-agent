import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settingsStore';
import type { ModelInfo } from '../../types';

/** 当前支持的 provider 显示名 */
const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google Gemini',
};

const THINKING_LEVELS = [
  { value: 'off', label: 'Off' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const;

interface AgentSettingsProps {
  onNavigateToProvider?: () => void;
}

const AgentSettings: React.FC<AgentSettingsProps> = ({ onNavigateToProvider }) => {
  const { formData, setAgentFormData, clearSaveError } = useSettingsStore();
  const { t } = useTranslation(['settings', 'common']);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const { activeProviderId, activeModelId, thinkingLevel, maxTurns, providerConfigs } = formData.agent;

  // 已配置 API Key 的 provider 列表（用于 provider 选择下拉框）
  const configuredProviders = (providerConfigs || [])
    .filter(c => c.apiKey?.trim())
    .map(c => ({
      id: c.id,
      name: PROVIDER_NAMES[c.id] || c.id,
    }));

  // Load models when provider changes
  useEffect(() => {
    const loadModels = async () => {
      if (!activeProviderId) {
        setModels([]);
        return;
      }

      setIsLoadingModels(true);
      try {
        const models = await window.ipc.agent.getModels(activeProviderId);
        if (Array.isArray(models) && models.length > 0) {
          setModels(models);
          setIsLoadingModels(false);
          return;
        }
      } catch {
        // fallback
      }
      setModels([]);
      setIsLoadingModels(false);
    };
    loadModels();
  }, [activeProviderId]);

  const handleProviderChange = (provider: string) => {
    clearSaveError();
    setAgentFormData({ activeProviderId: provider, activeModelId: '' });
  };

  const handleModelChange = (modelId: string) => {
    clearSaveError();
    setAgentFormData({ activeModelId: modelId });
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

  const getProviderName = (providerId: string): string => {
    return PROVIDER_NAMES[providerId] || providerId;
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

      {/* Provider selection */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          {t('settings:agent.provider')}
        </label>
        <select
          value={activeProviderId}
          onChange={(e) => handleProviderChange(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-border
                     bg-background text-foreground
                     focus:ring-2 focus:ring-primary focus:border-primary
                     outline-none transition-colors"
        >
          {configuredProviders.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
          {/* Include current activeProviderId if not in available list */}
          {activeProviderId && !configuredProviders.find(p => p.id === activeProviderId) && (
            <option value={activeProviderId}>
              {getProviderName(activeProviderId)}
            </option>
          )}
        </select>
      </div>

      {/* Model selection */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          {t('settings:agent.model')}
        </label>
        {isLoadingModels ? (
          <div className="px-3 py-2 text-sm text-muted-foreground bg-muted rounded-lg">
            {t('common:loading')}
          </div>
        ) : models.length > 0 ? (
          <select
            value={activeModelId}
            onChange={(e) => handleModelChange(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-border
                       bg-background text-foreground
                       focus:ring-2 focus:ring-primary focus:border-primary
                       outline-none transition-colors"
          >
            {!activeModelId && (
              <option value="">{t('settings:agent.selectModel')}</option>
            )}
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
            {/* Include current activeModelId if not in list */}
            {activeModelId && !models.find(m => m.id === activeModelId) && (
              <option value={activeModelId}>{activeModelId}</option>
            )}
          </select>
        ) : (
          <input
            type="text"
            value={activeModelId}
            onChange={(e) => handleModelChange(e.target.value)}
            placeholder={t('settings:agent.modelPlaceholder')}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg
                       bg-background text-foreground
                       placeholder-muted-foreground
                       focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {t('settings:agent.modelHint')}
        </p>
      </div>

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
    </div>
  );
};

export default AgentSettings;
