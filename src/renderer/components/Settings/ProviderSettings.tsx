import React, { useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { Server, Trash2, Edit2, Plus, Check, Key, Globe, Cpu, CheckCircle, Power } from 'lucide-react';
import type { Provider } from '../../types';

interface ProviderFormData {
  name: string;
  apiUrl: string;
  apiKey: string;
  model: string;
}

const EMPTY_FORM: ProviderFormData = {
  name: '',
  apiUrl: '',
  apiKey: '',
  model: '',
};

const ProviderSettings: React.FC = () => {
  const { formData, setAgentFormData, clearSaveError } = useSettingsStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formValues, setFormValues] = useState<ProviderFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<ProviderFormData>>({});

  const providers = formData.agent.providers || [];
  const activeProviderId = formData.agent.activeProviderId;

  const validateForm = (): boolean => {
    const errors: Partial<ProviderFormData> = {};
    if (!formValues.name.trim()) errors.name = '名称不能为空';
    if (!formValues.apiUrl.trim()) errors.apiUrl = 'API URL 不能为空';
    if (!formValues.apiKey.trim()) errors.apiKey = 'API Key 不能为空';
    if (!formValues.model.trim()) errors.model = '模型不能为空';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddProvider = () => {
    setIsAdding(true);
    setFormValues(EMPTY_FORM);
    setFormErrors({});
  };

  const handleSaveNew = () => {
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
    setIsAdding(false);
    setFormValues(EMPTY_FORM);
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setFormValues(EMPTY_FORM);
    setFormErrors({});
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

  const handleSaveEdit = () => {
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
      title: '确认删除',
      message: `确定要删除 Provider "${provider.name}" 吗？`,
    });

    if (!confirmed) return;

    clearSaveError();
    const filtered = providers.filter(p => p.id !== provider.id);
    // 如果删除的是当前激活的 Provider，清除激活状态或选择第一个
    let newActiveId = activeProviderId;
    if (activeProviderId === provider.id) {
      newActiveId = filtered.length > 0 ? filtered[0].id : null;
    }
    setAgentFormData({ providers: filtered, activeProviderId: newActiveId });
  };

  const handleSetActive = (id: string) => {
    clearSaveError();
    setAgentFormData({ activeProviderId: id });
  };

  const renderForm = (onSave: () => void, onCancel: () => void) => (
    <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-primary-500">
      {/* 名称 */}
      <div>
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-1">
          <Server className="w-3 h-3" />
          名称
        </label>
        <input
          type="text"
          value={formValues.name}
          onChange={(e) => setFormValues({ ...formValues, name: e.target.value })}
          placeholder="例如：Claude、GLM、Minimax"
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                     placeholder-gray-400 dark:placeholder-gray-500
                     focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
      </div>

      {/* API URL */}
      <div>
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-1">
          <Globe className="w-3 h-3" />
          API URL
        </label>
        <input
          type="text"
          value={formValues.apiUrl}
          onChange={(e) => setFormValues({ ...formValues, apiUrl: e.target.value })}
          placeholder="https://api.anthropic.com"
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                     placeholder-gray-400 dark:placeholder-gray-500
                     focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        {formErrors.apiUrl && <p className="text-xs text-red-500 mt-1">{formErrors.apiUrl}</p>}
      </div>

      {/* API Key */}
      <div>
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-1">
          <Key className="w-3 h-3" />
          API Key
        </label>
        <input
          type="password"
          value={formValues.apiKey}
          onChange={(e) => setFormValues({ ...formValues, apiKey: e.target.value })}
          placeholder="sk-ant-..."
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                     placeholder-gray-400 dark:placeholder-gray-500
                     focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        {formErrors.apiKey && <p className="text-xs text-red-500 mt-1">{formErrors.apiKey}</p>}
      </div>

      {/* 模型 */}
      <div>
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-1">
          <Cpu className="w-3 h-3" />
          模型
        </label>
        <input
          type="text"
          value={formValues.model}
          onChange={(e) => setFormValues({ ...formValues, model: e.target.value })}
          placeholder="claude-sonnet-4-20250514"
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                     placeholder-gray-400 dark:placeholder-gray-500
                     focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        {formErrors.model && <p className="text-xs text-red-500 mt-1">{formErrors.model}</p>}
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400
                     hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          取消
        </button>
        <button
          onClick={onSave}
          className="flex items-center gap-1 px-3 py-1.5 text-sm
                     bg-primary-500 text-white rounded-lg
                     hover:bg-primary-600 transition-colors"
        >
          <Check className="w-4 h-4" />
          保存
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 标题和添加按钮 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">Provider 列表</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            配置多个 AI 服务提供商，选择一个作为当前使用
          </p>
        </div>
        {!isAdding && (
          <button
            onClick={handleAddProvider}
            className="flex items-center gap-2 px-3 py-1.5 text-sm
                       bg-primary-500 text-white rounded-lg
                       hover:bg-primary-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加
          </button>
        )}
      </div>

      {/* 添加表单 */}
      {isAdding && renderForm(handleSaveNew, handleCancelAdd)}

      {/* Provider 列表 */}
      {providers.length === 0 && !isAdding ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <Server className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">暂无 Provider</p>
          <p className="text-xs mt-1">点击上方按钮添加</p>
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
                      ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500'
                      : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                    }`}
                >
                  {/* 图标 */}
                  <div className="flex-shrink-0">
                    <Server className={`w-5 h-5 ${activeProviderId === provider.id ? 'text-primary-500' : 'text-gray-400'}`} />
                  </div>

                  {/* 信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-700 dark:text-gray-200 truncate">
                        {provider.name}
                      </span>
                      {activeProviderId === provider.id && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs
                                       bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400
                                       rounded">
                          <CheckCircle className="w-3 h-3" />
                          当前使用
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {provider.model} · {provider.apiUrl}
                    </p>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1">
                    {activeProviderId !== provider.id && (
                      <button
                        onClick={() => handleSetActive(provider.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs
                                   text-primary-600 dark:text-primary-400
                                   hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded
                                   transition-colors"
                        title="启用"
                      >
                        <Power className="w-3.5 h-3.5" />
                        启用
                      </button>
                    )}
                    <button
                      onClick={() => handleStartEdit(provider)}
                      className="p-1.5 text-gray-500 hover:text-primary-600
                                 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded
                                 transition-colors"
                      title="编辑"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteProvider(provider)}
                      className="p-1.5 text-gray-500 hover:text-red-600
                                 hover:bg-red-50 dark:hover:bg-red-900/20 rounded
                                 transition-colors"
                      title="删除"
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
      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <p>Provider 用于配置 AI 服务的 API 连接信息。</p>
        <p>点击「启用」按钮可将其设为当前使用。</p>
      </div>
    </div>
  );
};

export default ProviderSettings;
