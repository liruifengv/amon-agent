import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nanoid } from 'nanoid';
import { useSettingsStore } from '../../store/settingsStore';
import { Plus, CheckCircle } from 'lucide-react';
import type { ConnectionConfig, AgentSettings } from '../../types';
import type { ConnectionSpec } from '@shared/ai-catalog';
import { AI_CATALOG } from '@shared/ai-catalog';
import ProviderIcon from './ProviderIcon';
import ProviderPickerModal from './ProviderPickerModal';
import ProviderEditModal from './ProviderEditModal';
import { getConnectionAuthStatus, isConnectionConfigured } from '../../utils/provider-auth';
import { getConnectionIcon, getConnectionModelName } from '../../utils/connection-catalog';

const ProviderSettings: React.FC = () => {
  const {
    formData,
    setAgentFormData,
    clearSaveError,
    saveSettings,
    connectionAuthStatuses,
  } = useSettingsStore();
  const { t } = useTranslation(['settings', 'common']);

  const [showPicker, setShowPicker] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ConnectionConfig | null>(null);
  const [isNewConfig, setIsNewConfig] = useState(false);

  const connections = formData.agent.connections || [];
  const activeConnectionId = formData.agent.activeConnectionId;

  const handleAddClick = () => {
    setShowPicker(true);
  };

  const handleSpecSelect = (spec: ConnectionSpec) => {
    setShowPicker(false);
    const serviceAuth = AI_CATALOG.services[spec.serviceId].auth;
    const newConfig: ConnectionConfig = {
      id: nanoid(10),
      specId: spec.id,
      name: spec.name,
      baseUrl: spec.defaultBaseUrl,
      modelKey: spec.defaultModelKey,
      customModelId: '',
      auth: serviceAuth.type === 'oauth' ? { type: 'oauth' } : { type: 'apiKey' },
      apiKey: '',
    };
    setEditingConfig(newConfig);
    setIsNewConfig(true);
  };

  const handleItemClick = (config: ConnectionConfig) => {
    setEditingConfig(config);
    setIsNewConfig(false);
  };

  const handleSave = async (
    config: ConnectionConfig,
    options?: { closeAfterSave?: boolean },
  ): Promise<boolean> => {
    clearSaveError();
    let newConnections: ConnectionConfig[];
    const updates: Partial<AgentSettings> = {};

    if (isNewConfig) {
      newConnections = [...connections, config];
      if (connections.length === 0) {
        updates.activeConnectionId = config.id;
      }
    } else {
      newConnections = connections.map((current) =>
        current.id === config.id ? config : current,
      );
    }

    updates.connections = newConnections;
    setAgentFormData(updates);
    const saved = await saveSettings();
    if (!saved) {
      return false;
    }

    if (options?.closeAfterSave === false) {
      setEditingConfig(config);
      setIsNewConfig(false);
    } else {
      setEditingConfig(null);
      setIsNewConfig(false);
    }

    return true;
  };

  const handleDelete = async (id: string) => {
    clearSaveError();
    await window.ipc.connectionAuth.disconnect(id).catch(() => undefined);

    const newConnections = connections.filter((connection) => connection.id !== id);
    const updates: Partial<AgentSettings> = {
      connections: newConnections,
    };
    if (activeConnectionId === id) {
      updates.activeConnectionId = newConnections[0]?.id || null;
    }
    setAgentFormData(updates);
    setEditingConfig(null);
    setTimeout(() => saveSettings(), 0);
  };

  const isActive = (config: ConnectionConfig) => activeConnectionId === config.id;
  const isConfigured = (config: ConnectionConfig) => isConnectionConfigured(
    config,
    getConnectionAuthStatus(connectionAuthStatuses, config.id),
  );

  const handleActivate = (e: React.MouseEvent, config: ConnectionConfig) => {
    e.stopPropagation();
    clearSaveError();
    setAgentFormData({
      activeConnectionId: config.id,
    });
    setTimeout(() => saveSettings(), 0);
  };

  return (
    <div className="space-y-4">
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

      <div className="space-y-2">
        {connections.map((config) => (
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
            <ProviderIcon icon={getConnectionIcon(config.specId)} size={24} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">
                {config.name}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {config.modelKey ? getConnectionModelName(config.modelKey, config.customModelId) : t('common:notSet')}
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
                  {config.auth.type === 'oauth'
                    ? t('settings:provider.notConnected')
                    : t('common:notConfigured')}
                </span>
              )}
            </div>
          </button>
        ))}

        {connections.length === 0 && (
          <div className="p-8 rounded-lg border border-dashed border-border text-center">
            <p className="text-sm text-muted-foreground">
              {t('settings:provider.emptyState')}
            </p>
          </div>
        )}
      </div>

      <ProviderPickerModal
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handleSpecSelect}
      />

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
