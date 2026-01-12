import React from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import SystemPromptEditor from './SystemPromptEditor';
import type { PermissionMode } from '../../types';
import { Shield, FileEdit, XCircle, ShieldOff } from 'lucide-react';

const PERMISSION_MODES: { value: PermissionMode; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'default', label: '默认', description: '工具调用需要审批', icon: <Shield className="w-6 h-6" /> },
  { value: 'acceptEdits', label: '自动编辑', description: '自动批准文件编辑', icon: <FileEdit className="w-6 h-6" /> },
  { value: 'dontAsk', label: '不询问', description: '拒绝未允许的工具', icon: <XCircle className="w-6 h-6" /> },
  { value: 'bypassPermissions', label: '绕过权限', description: '绕过所有权限检查', icon: <ShieldOff className="w-6 h-6" /> },
];

const AgentSettings: React.FC = () => {
  const { formData, setAgentFormData, clearSaveError } = useSettingsStore();

  return (
    <div className="space-y-6">
      {/* 权限模式 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
          权限模式
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
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                  : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}
              `}
            >
              {mode.icon}
              <span className="text-sm font-medium">{mode.label}</span>
              <span className="text-xs text-center opacity-70">{mode.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* System Prompt */}
      <SystemPromptEditor />
    </div>
  );
};

export default AgentSettings;
