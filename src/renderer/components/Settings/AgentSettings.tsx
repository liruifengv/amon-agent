import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settingsStore';
import SystemPromptEditor from './SystemPromptEditor';
import type { PermissionMode } from '../../types';
import { Shield, FileEdit, XCircle, ShieldOff, Terminal } from 'lucide-react';

interface AgentSettingsProps {
  onNavigateToProvider?: () => void;
}

const AgentSettings: React.FC<AgentSettingsProps> = ({ onNavigateToProvider }) => {
  const { formData, setAgentFormData, clearSaveError } = useSettingsStore();
  const { t } = useTranslation(['settings', 'common']);

  const PERMISSION_MODES: { value: PermissionMode; label: string; description: string; icon: React.ReactNode }[] = [
    { value: 'default', label: t('settings:agent.default'), description: t('settings:agent.defaultDesc'), icon: <Shield className="w-6 h-6" /> },
    { value: 'acceptEdits', label: t('settings:agent.acceptEdits'), description: t('settings:agent.acceptEditsDesc'), icon: <FileEdit className="w-6 h-6" /> },
    { value: 'dontAsk', label: t('settings:agent.dontAsk'), description: t('settings:agent.dontAskDesc'), icon: <XCircle className="w-6 h-6" /> },
    { value: 'bypassPermissions', label: t('settings:agent.bypassPermissions'), description: t('settings:agent.bypassPermissionsDesc'), icon: <ShieldOff className="w-6 h-6" /> },
  ];

  // 获取当前激活的 Provider
  const providers = formData.agent.providers || [];
  const activeProvider = providers.find(p => p.id === formData.agent.activeProviderId);

  return (
    <div className="space-y-6">
      {/* 当前供应商 */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>{t('settings:agent.currentProvider')}:</span>
          {activeProvider ? (
            <span className="text-primary font-medium">{activeProvider.name}</span>
          ) : (
            <span className="text-warning">{t('common:notConfigured')}</span>
          )}
        </div>
        <button
          onClick={onNavigateToProvider}
          className="text-xs text-primary hover:text-primary/80"
        >
          {t('common:change')}
        </button>
      </div>

      {/* 权限模式 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-3">
          {t('settings:agent.permissionMode')}
        </label>
        <div className="grid grid-cols-4 gap-3">
          {PERMISSION_MODES.map((mode) => (
            <button
              key={mode.value}
              onClick={() => {
                clearSaveError();
                setAgentFormData({ permissionMode: mode.value });
              }}
              className={`
                flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer
                border-2 transition-all duration-150
                ${(formData.agent.permissionMode || 'default') === mode.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-accent'}
              `}
            >
              {mode.icon}
              <span className="text-sm font-medium">{mode.label}</span>
              <span className="text-xs text-center opacity-70">{mode.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 系统提示词 */}
      <SystemPromptEditor />

      {/* Claude Code 模式 */}
      <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-medium text-foreground">{t('settings:agent.claudeCodeMode')}</h3>
            <p className="text-xs text-muted-foreground">
              {t('settings:agent.claudeCodeModeDesc')}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            clearSaveError();
            setAgentFormData({ claudeCodeMode: !formData.agent.claudeCodeMode });
          }}
          className={`
            relative inline-flex h-6 w-11 items-center rounded-full transition-colors
            ${formData.agent.claudeCodeMode
              ? 'bg-primary'
              : 'bg-muted-foreground/30'}
          `}
        >
          <span
            className={`
              inline-block h-4 w-4 transform rounded-full bg-white transition-transform
              ${formData.agent.claudeCodeMode ? 'translate-x-6' : 'translate-x-1'}
            `}
          />
        </button>
      </div>
    </div>
  );
};

export default AgentSettings;
