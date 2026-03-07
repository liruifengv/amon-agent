import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Eye, EyeOff } from 'lucide-react';
import { PROVIDER_PRESETS } from '@shared/provider-presets';
import type { ProviderConfig } from '../../types';
import ProviderIcon from './ProviderIcon';

interface ProviderEditModalProps {
  open: boolean;
  config: ProviderConfig | null;
  isNew: boolean;
  onClose: () => void;
  onSave: (config: ProviderConfig) => void;
  onDelete?: (id: string) => void;
}

const ProviderEditModal: React.FC<ProviderEditModalProps> = ({
  open,
  config,
  isNew,
  onClose,
  onSave,
  onDelete,
}) => {
  const { t } = useTranslation(['settings', 'common']);
  const [form, setForm] = useState<ProviderConfig>({
    id: '',
    apiType: 'openai-completions',
    provider: '',
    icon: '',
    name: '',
    apiKey: '',
    baseUrl: undefined,
    modelId: '',
  });
  const [showApiKey, setShowApiKey] = useState(false);

  // Sync form state when config prop changes
  const configId = config?.id;
  const [lastConfigId, setLastConfigId] = useState<string | null>(null);
  if (configId && configId !== lastConfigId && config) {
    setLastConfigId(configId);
    setForm({ ...config });
    setShowApiKey(false);
  }

  if (!open || !config) return null;

  const preset = PROVIDER_PRESETS.find(
    (p) => p.icon === form.icon || p.id === form.id
  );
  const defaultModels = preset?.defaultModels ?? [];

  const handleSave = () => {
    onSave(form);
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(form.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md bg-background border border-border rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <ProviderIcon icon={form.icon} size={22} />
          <h3 className="text-sm font-medium text-foreground flex-1">
            {isNew ? t('settings:provider.addProvider') : t('settings:provider.editProvider')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              {t('settings:provider.name')}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('settings:provider.namePlaceholder')}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg
                         bg-background text-foreground placeholder-muted-foreground
                         focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full px-3 py-2 pr-10 text-sm border border-border rounded-lg
                           bg-background text-foreground placeholder-muted-foreground
                           focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1
                           text-muted-foreground hover:text-foreground transition-colors"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Base URL
              <span className="text-muted-foreground/60 ml-1">({t('common:optional')})</span>
            </label>
            <input
              type="text"
              value={form.baseUrl ?? ''}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value || undefined })}
              placeholder={t('settings:provider.baseUrlPlaceholder')}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg
                         bg-background text-foreground placeholder-muted-foreground
                         focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              {t('settings:provider.model')}
            </label>
            <input
              type="text"
              value={form.modelId}
              onChange={(e) => setForm({ ...form, modelId: e.target.value })}
              placeholder={t('settings:provider.modelPlaceholder')}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg
                         bg-background text-foreground placeholder-muted-foreground
                         focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            {defaultModels.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {defaultModels.map((modelId) => (
                  <button
                    key={modelId}
                    type="button"
                    onClick={() => setForm({ ...form, modelId })}
                    className={`px-2 py-0.5 text-xs rounded-md border transition-colors cursor-pointer ${
                      form.modelId === modelId
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                    }`}
                  >
                    {modelId}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1.5">
              {t('settings:provider.modelHint')}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <div>
            {!isNew && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-3 py-1.5 text-xs text-destructive hover:text-destructive/80
                           border border-destructive/30 hover:border-destructive/50
                           rounded-lg transition-colors"
              >
                {t('settings:provider.deleteProvider')}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground
                         border border-border rounded-lg transition-colors"
            >
              {t('common:cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!form.name.trim()}
              className="px-4 py-1.5 text-xs text-primary-foreground bg-primary
                         hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                         rounded-lg transition-colors"
            >
              {t('common:save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProviderEditModal;
