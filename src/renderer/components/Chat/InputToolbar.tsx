import React, { useState, useRef, useEffect } from 'react';
import { Shield, FileEdit, XCircle, ShieldOff, ChevronDown } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useSessionStore } from '../../store/sessionStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { PermissionMode } from '../../types';

const PERMISSION_MODES: { value: PermissionMode; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'default', label: '默认', description: '工具调用需要审批', icon: <Shield className="w-4 h-4" /> },
  { value: 'acceptEdits', label: '自动编辑', description: '自动批准文件编辑', icon: <FileEdit className="w-4 h-4" /> },
  { value: 'dontAsk', label: '不询问', description: '拒绝未允许的工具', icon: <XCircle className="w-4 h-4" /> },
  { value: 'bypassPermissions', label: '绕过权限', description: '绕过所有权限检查', icon: <ShieldOff className="w-4 h-4" /> },
];

const InputToolbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { currentSessionId } = useSessionStore();
  const { getSessionPermissionMode, setSessionPermissionMode } = useChatStore();
  const { settings } = useSettingsStore();

  // 获取当前会话的临时权限模式，如果没有则使用全局设置
  const sessionPermissionMode = getSessionPermissionMode(currentSessionId);
  const currentMode = sessionPermissionMode ?? settings.agent.permissionMode ?? 'default';
  const isOverridden = sessionPermissionMode !== undefined;

  // 获取当前模式的配置
  const currentModeConfig = PERMISSION_MODES.find(m => m.value === currentMode) || PERMISSION_MODES[0];

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleModeSelect = (mode: PermissionMode) => {
    if (!currentSessionId) return;

    // 如果选择的是全局设置的模式，则清除临时设置
    if (mode === settings.agent.permissionMode) {
      setSessionPermissionMode(currentSessionId, undefined);
    } else {
      setSessionPermissionMode(currentSessionId, mode);
    }
    setIsOpen(false);
  };

  const handleReset = () => {
    if (!currentSessionId) return;
    setSessionPermissionMode(currentSessionId, undefined);
    setIsOpen(false);
  };

  if (!currentSessionId) return null;

  return (
    <div className="flex items-center gap-2 py-2">
      {/* 权限模式选择器 */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`
            flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs
            transition-colors duration-150
            ${isOverridden
              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 border border-primary-300 dark:border-primary-700'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
            }
          `}
        >
          {currentModeConfig.icon}
          <span className="font-medium">{currentModeConfig.label}</span>
          {isOverridden && (
            <span className="text-[10px] opacity-70">(临时)</span>
          )}
          <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* 下拉菜单 */}
        {isOpen && (
          <div className="absolute bottom-full left-0 mb-1 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
            <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
              当前会话权限模式
            </div>
            {PERMISSION_MODES.map((mode) => (
              <button
                key={mode.value}
                onClick={() => handleModeSelect(mode.value)}
                className={`
                  w-full flex items-start gap-3 px-3 py-2 text-left
                  hover:bg-gray-50 dark:hover:bg-gray-700/50
                  ${currentMode === mode.value ? 'bg-primary-50 dark:bg-primary-900/20' : ''}
                `}
              >
                <div className={`
                  mt-0.5
                  ${currentMode === mode.value ? 'text-primary-500' : 'text-gray-400 dark:text-gray-500'}
                `}>
                  {mode.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`
                    text-sm font-medium
                    ${currentMode === mode.value ? 'text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-200'}
                  `}>
                    {mode.label}
                    {mode.value === settings.agent.permissionMode && (
                      <span className="ml-1.5 text-[10px] text-gray-400 dark:text-gray-500">(全局)</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {mode.description}
                  </div>
                </div>
              </button>
            ))}
            {isOverridden && (
              <>
                <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                <button
                  onClick={handleReset}
                  className="w-full px-3 py-2 text-left text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  重置为全局设置
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InputToolbar;
