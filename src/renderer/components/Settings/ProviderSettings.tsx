import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settingsStore';
import { Server, Trash2, Edit2, Plus, Check, Key, Globe, Cpu, CheckCircle, Power } from 'lucide-react';
import type { Provider } from '../../types';

interface ProviderFormData {
  name: string;
  apiUrl: string;
  apiKey: string;
  model: string;
}

interface PresetProvider {
  id: string;
  name: string;
  apiUrl: string;
  models: string[];
}

const PRESET_PROVIDERS: PresetProvider[] = [
  {
    id: 'custom',
    name: 'Custom',
    apiUrl: '',
    models: ['claude-opus-4-6', 'claude-opus-4-5-20251101', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'],
  },
  {
    id: 'claude',
    name: 'Claude Official',
    apiUrl: 'https://api.anthropic.com',
    models: ['claude-opus-4-6', 'claude-opus-4-5-20251101', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    apiUrl: 'https://openrouter.ai/api',
    models: ['anthropic/claude-opus-4.6', 'anthropic/claude-opus-4.5', 'anthropic/claude-sonnet-4.5', 'anthropic/claude-haiku-4.5'],
  },
  {
    id: 'glm',
    name: 'GLM',
    apiUrl: 'https://open.bigmodel.cn/api/anthropic',
    models: ['glm-5', 'glm-4.7'],
  },
  {
    id: 'glm-en',
    name: 'GLM (EN)',
    apiUrl: 'https://api.z.ai/api/anthropic',
    models: ['glm-5', 'glm-4.7'],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    apiUrl: 'https://api.minimaxi.com/anthropic',
    models: ['MiniMax-M2.5', 'MiniMax-M2.1'],
  },
  {
    id: 'minimax-en',
    name: 'MiniMax (EN)',
    apiUrl: 'https://api.minimax.io/anthropic',
    models: ['MiniMax-M2.5', 'MiniMax-M2.1'],
  },
  {
    id: 'kimi',
    name: 'Kimi',
    apiUrl: 'https://api.kimi.com/coding',
    models: ['kimi-for-coding'],
  },
];

const EMPTY_FORM: ProviderFormData = {
  name: '',
  apiUrl: '',
  apiKey: '',
  model: '',
};

const ProviderSettings: React.FC = () => {
  const { formData, setAgentFormData, clearSaveError, saveSettings } = useSettingsStore();
  const { t } = useTranslation(['settings', 'common']);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formValues, setFormValues] = useState<ProviderFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<ProviderFormData>>({});
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>('custom');

  const providers = formData.agent.providers || [];
  const activeProviderId = formData.agent.activeProviderId;

  // 获取当前选中预置供应商的模型列表
  const currentPresetModels = selectedPresetId
    ? PRESET_PROVIDERS.find((p) => p.id === selectedPresetId)?.models || []
    : [];

  const handleSelectPreset = (preset: PresetProvider) => {
    setSelectedPresetId(preset.id);
    if (preset.id === 'custom') {
      // 自定义模式：清空表单，允许用户自由输入
      setFormValues({
        ...formValues,
        name: '',
        apiUrl: '',
        model: '',
      });
    } else {
      // 预置模式：填充默认值
      setFormValues({
        ...formValues,
        name: preset.name,
        apiUrl: preset.apiUrl,
        model: preset.models[0] || '',
      });
    }
  };

  const validateForm = (): boolean => {
    const errors: Partial<ProviderFormData> = {};
    if (!formValues.name.trim()) errors.name = t('settings:provider.nameRequired');
    if (!formValues.apiUrl.trim()) errors.apiUrl = t('settings:provider.apiUrlRequired');
    if (!formValues.apiKey.trim()) errors.apiKey = t('settings:provider.apiKeyRequired');
    if (!formValues.model.trim()) errors.model = t('settings:provider.modelRequired');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddProvider = () => {
    setIsAdding(true);
    setFormValues(EMPTY_FORM);
    setFormErrors({});
    setSelectedPresetId('custom');
  };

  const handleSaveNew = async () => {
    if (!validateForm()) return;

    const newProvider: Provider = {
      id: crypto.randomUUID(),
      name: formValues.name.trim(),
      apiUrl: formValues.apiUrl.trim(),
      apiKey: formValues.apiKey.trim(),
      model: formValues.model.trim(),
    };

    clearSaveError();
    const newProviders = [...providers, newProvider];
    // 如果是第一个 Provider，自动设为激活
    const newActiveId = providers.length === 0 ? newProvider.id : activeProviderId;
    setAgentFormData({ providers: newProviders, activeProviderId: newActiveId });
    await saveSettings();
    setIsAdding(false);
    setFormValues(EMPTY_FORM);
    setSelectedPresetId(null);
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setFormValues(EMPTY_FORM);
    setFormErrors({});
    setSelectedPresetId(null);
  };

  const handleStartEdit = (provider: Provider) => {
    setEditingId(provider.id);
    setFormValues({
      name: provider.name,
      apiUrl: provider.apiUrl,
      apiKey: provider.apiKey,
      model: provider.model,
    });
    setFormErrors({});
  };

  const handleSaveEdit = async () => {
    if (!validateForm() || !editingId) return;

    clearSaveError();
    const updated = providers.map(p =>
      p.id === editingId
        ? {
            ...p,
            name: formValues.name.trim(),
            apiUrl: formValues.apiUrl.trim(),
            apiKey: formValues.apiKey.trim(),
            model: formValues.model.trim(),
          }
        : p
    );
    setAgentFormData({ providers: updated });
    await saveSettings();
    setEditingId(null);
    setFormValues(EMPTY_FORM);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormValues(EMPTY_FORM);
    setFormErrors({});
  };

  const handleDeleteProvider = async (provider: Provider) => {
    const { confirmed } = await window.electronAPI.dialog.confirm({
      title: t('common:confirmDelete'),
      message: t('settings:provider.confirmDeleteProvider', { name: provider.name }),
    });

    if (!confirmed) return;

    clearSaveError();
    const filtered = providers.filter(p => p.id !== provider.id);
    // 如果删除的是当前激活的供应商，清除激活状态或选择第一个
    let newActiveId = activeProviderId;
    if (activeProviderId === provider.id) {
      newActiveId = filtered.length > 0 ? filtered[0].id : null;
    }
    setAgentFormData({ providers: filtered, activeProviderId: newActiveId });
    await saveSettings();
  };

  const handleSetActive = async (id: string) => {
    clearSaveError();
    setAgentFormData({ activeProviderId: id });
    await saveSettings();
  };

  const renderForm = (onSave: () => void, onCancel: () => void) => (
    <div className="space-y-3 p-4 bg-muted rounded-lg border border-primary">
      {/* 预置供应商选择器 */}
      {isAdding && (
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">
            {t('settings:provider.selectPresetProvider')}
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESET_PROVIDERS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors
                  ${selectedPresetId === preset.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:bg-accent'
                  }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 名称 */}
      <div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Server className="w-3 h-3" />
          {t('settings:provider.name')}
        </label>
        <input
          type="text"
          value={formValues.name}
          onChange={(e) => setFormValues({ ...formValues, name: e.target.value })}
          placeholder={t('settings:provider.namePlaceholder')}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg
                     bg-background text-foreground
                     placeholder-muted-foreground
                     focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        {formErrors.name && <p className="text-xs text-destructive mt-1">{formErrors.name}</p>}
      </div>

      {/* API URL */}
      <div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Globe className="w-3 h-3" />
          API URL
        </label>
        <input
          type="text"
          value={formValues.apiUrl}
          onChange={(e) => setFormValues({ ...formValues, apiUrl: e.target.value })}
          placeholder={t('settings:provider.apiUrlPlaceholder')}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg
                     bg-background text-foreground
                     placeholder-muted-foreground
                     focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        {formErrors.apiUrl && <p className="text-xs text-destructive mt-1">{formErrors.apiUrl}</p>}
        <p className="text-xs text-muted-foreground mt-1">
          {t('settings:provider.apiUrlHint')}
        </p>
      </div>

      {/* API Key */}
      <div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Key className="w-3 h-3" />
          API Key
        </label>
        <input
          type="password"
          value={formValues.apiKey}
          onChange={(e) => setFormValues({ ...formValues, apiKey: e.target.value })}
          placeholder="sk-ant-..."
          className="w-full px-3 py-2 text-sm border border-border rounded-lg
                     bg-background text-foreground
                     placeholder-muted-foreground
                     focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        {formErrors.apiKey && <p className="text-xs text-destructive mt-1">{formErrors.apiKey}</p>}
      </div>

      {/* 模型 */}
      <div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Cpu className="w-3 h-3" />
          {t('settings:provider.model')}
        </label>
        <input
          type="text"
          value={formValues.model}
          onChange={(e) => setFormValues({ ...formValues, model: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg
                     bg-background text-foreground
                     placeholder-muted-foreground
                     focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        {formErrors.model && <p className="text-xs text-destructive mt-1">{formErrors.model}</p>}
        {/* 预置模型标签 */}
        {currentPresetModels.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {currentPresetModels.map((model) => (
              <button
                key={model}
                type="button"
                onClick={() => setFormValues({ ...formValues, model })}
                className={`px-2 py-0.5 text-xs rounded border transition-colors
                  ${formValues.model === model
                    ? 'bg-primary/20 text-primary border-primary'
                    : 'bg-background text-muted-foreground border-border hover:bg-accent'
                  }`}
              >
                {model}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-muted-foreground
                     hover:bg-accent rounded-lg transition-colors"
        >
          {t('common:cancel')}
        </button>
        <button
          onClick={onSave}
          className="flex items-center gap-1 px-3 py-1.5 text-sm
                     bg-primary text-primary-foreground rounded-lg
                     hover:bg-primary/90 transition-colors"
        >
          <Check className="w-4 h-4" />
          {t('common:save')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 标题和添加按钮 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">{t('settings:provider.providerList')}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {t('settings:provider.providerDesc')}
          </p>
        </div>
        {!isAdding && (
          <button
            onClick={handleAddProvider}
            className="flex items-center gap-2 px-3 py-1.5 text-sm
                       bg-primary text-primary-foreground rounded-lg
                       hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('common:add')}
          </button>
        )}
      </div>

      {/* 添加表单 */}
      {isAdding && renderForm(handleSaveNew, handleCancelAdd)}

      {/* Provider 列表 */}
      {providers.length === 0 && !isAdding ? (
        <div className="text-center py-8 text-muted-foreground bg-muted rounded-lg">
          <Server className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('settings:provider.noProviders')}</p>
          <p className="text-xs mt-1">{t('settings:provider.clickToAdd')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {providers.map((provider) => (
            <div key={provider.id}>
              {editingId === provider.id ? (
                renderForm(handleSaveEdit, handleCancelEdit)
              ) : (
                <div
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors
                    ${activeProviderId === provider.id
                      ? 'bg-primary/10 border-primary'
                      : 'bg-muted border-border'
                    }`}
                >
                  {/* 图标 */}
                  <div className="shrink-0">
                    <Server className={`w-5 h-5 ${activeProviderId === provider.id ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>

                  {/* 信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">
                        {provider.name}
                      </span>
                      {activeProviderId === provider.id && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs
                                       bg-primary/20 text-primary
                                       rounded">
                          <CheckCircle className="w-3 h-3" />
                          {t('settings:provider.currentlyUsing')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {provider.model} · {provider.apiUrl}
                    </p>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1">
                    {activeProviderId !== provider.id && (
                      <button
                        onClick={() => handleSetActive(provider.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs
                                   text-primary
                                   hover:bg-primary/10 rounded
                                   transition-colors"
                        title={t('common:enable')}
                      >
                        <Power className="w-3.5 h-3.5" />
                        {t('common:enable')}
                      </button>
                    )}
                    <button
                      onClick={() => handleStartEdit(provider)}
                      className="p-1.5 text-muted-foreground hover:text-primary
                                 hover:bg-primary/10 rounded
                                 transition-colors"
                      title={t('common:edit')}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteProvider(provider)}
                      className="p-1.5 text-muted-foreground hover:text-destructive
                                 hover:bg-destructive/10 rounded
                                 transition-colors"
                      title={t('common:delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 说明文字 */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>{t('settings:provider.providerHint1')}</p>
        <p>{t('settings:provider.providerHint2')}</p>
      </div>
    </div>
  );
};

export default ProviderSettings;
