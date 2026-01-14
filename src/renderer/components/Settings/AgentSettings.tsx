import React from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import SystemPromptEditor from './SystemPromptEditor';
import type { PermissionMode } from '../../types';
import { Shield, FileEdit, XCircle, ShieldOff, Key, Globe, Cpu } from 'lucide-react';

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
      {/* API 配置 */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">API 配置</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            如果你已安装 Claude Code，会自动使用其配置，以下字段可留空。仅在未安装 Claude Code 时需要手动配置。
          </p>
        </div>

        {/* API Key */}
        <div>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
            <Key className="w-4 h-4" />
            API Key
          </label>
          <input
            type="password"
            value={formData.agent.apiKey || ''}
            onChange={(e) => {
              clearSaveError();
              setAgentFormData({ apiKey: e.target.value });
            }}
            placeholder="sk-ant-..."
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Anthropic API Key，留空则使用环境变量 ANTHROPIC_API_KEY
          </p>
        </div>

        {/* Base URL */}
        <div>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
            <Globe className="w-4 h-4" />
            API URL
          </label>
          <input
            type="text"
            value={formData.agent.baseUrl || ''}
            onChange={(e) => {
              clearSaveError();
              setAgentFormData({ baseUrl: e.target.value });
            }}
            placeholder="https://api.anthropic.com"
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            自定义 API 端点，留空则使用默认端点
          </p>
        </div>

        {/* Model */}
        <div>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
            <Cpu className="w-4 h-4" />
            模型
          </label>
          <input
            type="text"
            value={formData.agent.model || ''}
            onChange={(e) => {
              clearSaveError();
              setAgentFormData({ model: e.target.value });
            }}
            placeholder="claude-sonnet-4-20250514"
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Claude 模型名称，留空则使用默认模型
          </p>
        </div>
      </div>

      {/* 分隔线 */}
      <hr className="border-gray-200 dark:border-gray-700" />

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
