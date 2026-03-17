import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Eye, EyeOff } from 'lucide-react';
import { PROVIDER_PRESETS } from '@shared/provider-presets';
import type { ProviderConfig } from '../../types';
import ProviderIcon from './ProviderIcon';
import { useSettingsStore } from '../../store/settingsStore';

interface ProviderEditModalProps {
  open: boolean;
  config: ProviderConfig | null;
  isNew: boolean;
  onClose: () => void;
  onSave: (config: ProviderConfig, options?: { closeAfterSave?: boolean }) => Promise<boolean>;
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
  const { providerAuthStatuses, setProviderAuthStatus } = useSettingsStore();
  const [form, setForm] = useState<ProviderConfig>({
    id: '',
    apiType: 'openai-completions',
    provider: '',
    icon: '',
    name: '',
    apiKey: '',
    baseUrl: undefined,
    modelId: '',
    auth: { type: 'apiKey' },
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    (p) => p.id === form.id || (
      p.apiType === form.apiType &&
      p.provider === form.provider &&
      p.icon === form.icon
    )
  );
  const defaultModels = preset?.defaultModels ?? [];
  const authStatus = providerAuthStatuses[form.id];
  const supportsApiKey = form.auth.type === 'apiKey' && preset?.editableApiKey !== false;
  const supportsBaseUrl = preset?.editableBaseUrl !== false;

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      await onSave(form);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(form.id);
    }
  };

  const handleConnect = async () => {
    setIsSubmitting(true);
    try {
      if (isNew) {
        const saved = await onSave(form, { closeAfterSave: false });
        if (!saved) {
          return;
        }
      }

      const status = await window.ipc.providerAuth.connect(form.id);
      setProviderAuthStatus(status);
    } catch (error) {
      console.error('Failed to connect provider auth:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsSubmitting(true);
    try {
      await window.ipc.providerAuth.disconnect(form.id);
      setProviderAuthStatus({
        providerConfigId: form.id,
        state: 'disconnected',
      });
    } catch (error) {
      console.error('Failed to disconnect provider auth:', error);
    } finally {
      setIsSubmitting(false);
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

          {supportsApiKey && (
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
          )}

          {form.auth.type === 'oauth' && (
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {t('settings:provider.oauthConnection')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {authStatus?.accountLabel || t('settings:provider.notConnected')}
                  </div>
                </div>
                <span className="px-2 py-1 text-xs rounded-md bg-muted text-muted-foreground">
                  {authStatus?.state || 'disconnected'}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={isSubmitting || authStatus?.state === 'connecting' || !form.name.trim()}
                  className="px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50"
                >
                  {authStatus?.state === 'connected'
                    ? t('settings:provider.reconnect')
                    : t('settings:provider.connect')}
                </button>
                {!isNew && authStatus?.state === 'connected' && (
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={isSubmitting}
                    className="px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border hover:text-foreground rounded-lg transition-colors disabled:opacity-50"
                  >
                    {t('settings:provider.disconnect')}
                  </button>
                )}
              </div>

              {isNew && (
                <p className="text-xs text-muted-foreground">
                  {t('settings:provider.saveBeforeConnect')}
                </p>
              )}
            </div>
          )}

          {/* Base URL */}
          {supportsBaseUrl && (
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
          )}

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
                disabled={isSubmitting}
                className="px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground
                         border border-border rounded-lg transition-colors disabled:opacity-50"
              >
                {t('common:cancel')}
              </button>
              <button
                type="button"
                onClick={handleSave}
              disabled={isSubmitting || !form.name.trim()}
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
