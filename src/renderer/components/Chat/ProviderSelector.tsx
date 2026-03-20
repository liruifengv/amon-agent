import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settingsStore';
import type { ConnectionConfig } from '../../types';
import ProviderIcon from '../Settings/ProviderIcon';
import { getConnectionAuthStatus, isConnectionConfigured } from '../../utils/provider-auth';
import { getConnectionIcon, getConnectionModelName } from '../../utils/connection-catalog';

const ProviderSelector: React.FC = () => {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { settings, setAgentFormData, saveSettings, connectionAuthStatuses } = useSettingsStore();
  const { connections, activeConnectionId } = settings.agent;
  const configuredConnections = connections.filter((connection) =>
    isConnectionConfigured(connection, getConnectionAuthStatus(connectionAuthStatuses, connection.id)),
  );

  const activeConnection = configuredConnections.find((connection) => connection.id === activeConnectionId);
  const displayName = activeConnection?.name || activeConnectionId || t('common:notConfigured');
  const isDisabled = configuredConnections.length === 0;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleConnectionChange = async (connection: ConnectionConfig) => {
    setAgentFormData({
      activeConnectionId: connection.id,
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
        title={configuredConnections.length === 0 ? t('provider.pleaseConfigureProvider') : t('provider.switchProvider')}
      >
        {activeConnection ? (
          <ProviderIcon icon={getConnectionIcon(activeConnection.specId)} size={16} />
        ) : (
          <div className="w-4 h-4 rounded bg-muted" />
        )}
        <span className="font-medium max-w-28 truncate">{displayName}</span>
        {activeConnection?.modelKey && (
          <span className="text-muted-foreground max-w-24 truncate hidden sm:inline">
            {getConnectionModelName(activeConnection.modelKey, activeConnection.customModelId)}
          </span>
        )}
        {!isDisabled && (
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && configuredConnections.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 w-56 bg-popover rounded-lg shadow-lg border border-border py-1 z-50">
          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
            {t('provider.selectProvider')}
          </div>
          {configuredConnections.map((config: ConnectionConfig) => (
            <button
              key={config.id}
              onClick={() => handleConnectionChange(config)}
              className={`
                w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm cursor-pointer
                hover:bg-accent transition-colors
                ${activeConnectionId === config.id ? 'bg-primary/10' : ''}
              `}
            >
              <ProviderIcon icon={getConnectionIcon(config.specId)} size={18} />
              <div className="flex-1 min-w-0">
                <div className={`font-medium truncate ${activeConnectionId === config.id ? 'text-primary' : 'text-foreground'}`}>
                  {config.name}
                </div>
                {config.modelKey && (
                  <div className="text-xs text-muted-foreground truncate">
                    {getConnectionModelName(config.modelKey, config.customModelId)}
                  </div>
                )}
              </div>
              {activeConnectionId === config.id && (
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
