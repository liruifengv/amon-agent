import React, { useState, useRef, useEffect } from 'react';
import {
  Shield,
  FileEdit,
  XCircle,
  ShieldOff,
  ChevronDown,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../store/chatStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { PermissionMode } from '../../types';

// 权限模式配置
const PERMISSION_MODES: { value: PermissionMode; labelKey: string; descriptionKey: string; icon: React.ReactNode }[] = [
  { value: 'default', labelKey: 'permissionMode.default', descriptionKey: 'permissionMode.defaultDesc', icon: <Shield className="w-4 h-4" /> },
  { value: 'acceptEdits', labelKey: 'permissionMode.acceptEdits', descriptionKey: 'permissionMode.acceptEditsDesc', icon: <FileEdit className="w-4 h-4" /> },
  { value: 'dontAsk', labelKey: 'permissionMode.dontAsk', descriptionKey: 'permissionMode.dontAskDesc', icon: <XCircle className="w-4 h-4" /> },
  { value: 'bypassPermissions', labelKey: 'permissionMode.bypassPermissions', descriptionKey: 'permissionMode.bypassPermissionsDesc', icon: <ShieldOff className="w-4 h-4" /> },
];

interface PermissionModeSelectorProps {
  sessionId: string;
}

const PermissionModeSelector: React.FC<PermissionModeSelectorProps> = ({ sessionId }) => {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { getSessionPermissionMode, setSessionPermissionMode } = useChatStore();
  const { settings } = useSettingsStore();

  const sessionPermissionMode = getSessionPermissionMode(sessionId);
  const currentMode = sessionPermissionMode ?? settings.agent.permissionMode ?? 'default';
  const isOverridden = sessionPermissionMode !== undefined;
  const currentModeConfig = PERMISSION_MODES.find(m => m.value === currentMode) || PERMISSION_MODES[0];

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleModeSelect = (mode: PermissionMode) => {
    if (mode === settings.agent.permissionMode) {
      setSessionPermissionMode(sessionId, undefined);
    } else {
      setSessionPermissionMode(sessionId, mode);
    }
    setOpen(false);
  };

  const handleReset = () => {
    setSessionPermissionMode(sessionId, undefined);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`
          flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs border
          transition-colors duration-150
          ${isOverridden
            ? 'bg-primary/20 text-primary border-primary/30'
            : 'text-foreground border-border hover:bg-accent'
          }
        `}
      >
        {currentModeConfig.icon}
        <span className="font-medium">{t(currentModeConfig.labelKey)}</span>
        {isOverridden && (
          <span className="text-[10px] opacity-70">{t('permissionMode.temporary')}</span>
        )}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉菜单 */}
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-56 bg-popover rounded-lg shadow-lg border border-border py-1 z-50">
          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
            {t('permissionMode.currentSessionMode')}
          </div>
          {PERMISSION_MODES.map((mode) => (
            <button
              key={mode.value}
              onClick={() => handleModeSelect(mode.value)}
              className={`
                w-full flex items-start gap-3 px-3 py-2 text-left
                hover:bg-accent
                ${currentMode === mode.value ? 'bg-primary/10' : ''}
              `}
            >
              <div className={`
                mt-0.5
                ${currentMode === mode.value ? 'text-primary' : 'text-muted-foreground'}
              `}>
                {mode.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`
                  text-sm font-medium
                  ${currentMode === mode.value ? 'text-primary' : 'text-foreground'}
                `}>
                  {t(mode.labelKey)}
                  {mode.value === settings.agent.permissionMode && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground">{t('permissionMode.global')}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {t(mode.descriptionKey)}
                </div>
              </div>
            </button>
          ))}
          {isOverridden && (
            <>
              <div className="border-t border-border my-1" />
              <button
                onClick={handleReset}
                className="w-full px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent"
              >
                {t('permissionMode.resetToGlobal')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PermissionModeSelector;
