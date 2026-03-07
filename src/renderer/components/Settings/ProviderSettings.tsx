import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nanoid } from 'nanoid';
import { useSettingsStore } from '../../store/settingsStore';
import { Plus, CheckCircle } from 'lucide-react';
import type { ProviderConfig, AgentSettings } from '../../types';
import type { ProviderPreset } from '@shared/provider-presets';
import ProviderIcon from './ProviderIcon';
import ProviderPickerModal from './ProviderPickerModal';
import ProviderEditModal from './ProviderEditModal';

const ProviderSettings: React.FC = () => {
  const { formData, setAgentFormData, clearSaveError, saveSettings } = useSettingsStore();
  const { t } = useTranslation(['settings', 'common']);

  const [showPicker, setShowPicker] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ProviderConfig | null>(null);
  const [isNewConfig, setIsNewConfig] = useState(false);

  const providerConfigs = formData.agent.providerConfigs || [];
  const activeProviderId = formData.agent.activeProviderId;

  const handleAddClick = () => {
    setShowPicker(true);
  };

  const handlePresetSelect = (preset: ProviderPreset) => {
    setShowPicker(false);
    const newConfig: ProviderConfig = {
      id: nanoid(10),
      apiType: preset.apiType,
      provider: preset.provider,
      icon: preset.icon,
      name: preset.name,
      apiKey: '',
      baseUrl: preset.defaultBaseUrl,
      modelId: preset.defaultModels[0] ?? '',
    };
    setEditingConfig(newConfig);
    setIsNewConfig(true);
  };

  const handleItemClick = (config: ProviderConfig) => {
    setEditingConfig(config);
    setIsNewConfig(false);
  };

  const handleSave = async (config: ProviderConfig) => {
    clearSaveError();
    let newConfigs: ProviderConfig[];
    const updates: Partial<AgentSettings> = {};

    if (isNewConfig) {
      newConfigs = [...providerConfigs, config];
      // 第一个 provider 自动设为默认
      if (providerConfigs.length === 0) {
        updates.activeProviderId = config.id;
        updates.activeModelId = config.modelId || '';
      }
    } else {
      newConfigs = providerConfigs.map((c) =>
        c.id === config.id ? config : c
      );
      // 如果编辑的是当前激活的 provider，同步更新 modelId
      if (config.id === activeProviderId) {
        updates.activeModelId = config.modelId || '';
      }
    }

    updates.providerConfigs = newConfigs;
    setAgentFormData(updates);
    setEditingConfig(null);
    setTimeout(() => saveSettings(), 0);
  };

  const handleDelete = async (id: string) => {
    clearSaveError();
    const newConfigs = providerConfigs.filter((c) => c.id !== id);
    setAgentFormData({ providerConfigs: newConfigs });
    setEditingConfig(null);
    setTimeout(() => saveSettings(), 0);
  };

  const isActive = (config: ProviderConfig) => activeProviderId === config.id;
  const isConfigured = (config: ProviderConfig) => !!config.apiKey?.trim();

  const handleActivate = (e: React.MouseEvent, config: ProviderConfig) => {
    e.stopPropagation();
    clearSaveError();
    setAgentFormData({
      activeProviderId: config.id,
      activeModelId: config.modelId || '',
    });
    setTimeout(() => saveSettings(), 0);
  };

  return (
    <div className="space-y-4">
      {/* Header with description and add button */}
      <div className="flex items-start justify-between">
        <p className="text-xs text-muted-foreground flex-1 pr-4">
          {t('settings:provider.providerConfigDesc')}
        </p>
        <button
          type="button"
          onClick={handleAddClick}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                     text-primary border border-primary/30 hover:bg-primary/10
                     rounded-lg transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('settings:provider.addProvider')}
        </button>
      </div>

      {/* Provider List */}
      <div className="space-y-2">
        {providerConfigs.map((config) => (
          <button
            key={config.id}
            type="button"
            onClick={() => handleItemClick(config)}
            className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left cursor-pointer ${
              isActive(config)
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-foreground/20 bg-muted'
            }`}
          >
            <ProviderIcon icon={config.icon} size={24} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">
                {config.name}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {config.modelId || t('common:notSet')}
              </div>
            </div>
            <div className="shrink-0">
              {isActive(config) && isConfigured(config) && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs bg-primary/20 text-primary rounded">
                  <CheckCircle className="w-3 h-3" />
                  {t('settings:provider.active')}
                </span>
              )}
              {!isActive(config) && isConfigured(config) && (
                <button
                  type="button"
                  onClick={(e) => handleActivate(e, config)}
                  className="px-2 py-0.5 text-xs font-medium text-primary border border-primary/30
                             hover:bg-primary/10 rounded transition-colors cursor-pointer"
                >
                  {t('settings:provider.activate')}
                </button>
              )}
              {!isConfigured(config) && (
                <span className="text-xs text-muted-foreground/60">
                  {t('common:notConfigured')}
                </span>
              )}
            </div>
          </button>
        ))}

        {/* Empty state */}
        {providerConfigs.length === 0 && (
          <div className="p-8 rounded-lg border border-dashed border-border text-center">
            <p className="text-sm text-muted-foreground">
              {t('settings:provider.emptyState')}
            </p>
          </div>
        )}
      </div>

      {/* Picker Modal */}
      <ProviderPickerModal
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handlePresetSelect}
      />

      {/* Edit Modal */}
      <ProviderEditModal
        open={!!editingConfig}
        config={editingConfig}
        isNew={isNewConfig}
        onClose={() => setEditingConfig(null)}
        onSave={handleSave}
        onDelete={editingConfig && isActive(editingConfig) ? undefined : handleDelete}
      />
    </div>
  );
};

export default ProviderSettings;
