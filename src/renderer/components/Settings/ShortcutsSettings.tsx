import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settingsStore';
import { DEFAULT_SHORTCUTS, Shortcuts } from '../../types';
import { RotateCcw } from 'lucide-react';

// 将 Electron 快捷键格式转换为显示格式
function formatShortcut(shortcut: string): string {
  if (!shortcut) return '';

  const isMac = navigator.platform.toLowerCase().includes('mac');

  return shortcut
    .replace(/CmdOrCtrl/g, isMac ? '\u2318' : 'Ctrl')
    .replace(/Cmd/g, '\u2318')
    .replace(/Ctrl/g, isMac ? '\u2303' : 'Ctrl')
    .replace(/Alt/g, isMac ? '\u2325' : 'Alt')
    .replace(/Shift/g, isMac ? '\u21E7' : 'Shift')
    .replace(/\+/g, ' + ');
}

// 将键盘事件转换为 Electron 快捷键格式
function keyEventToShortcut(e: KeyboardEvent): string | null {
  const modifiers: string[] = [];

  if (e.metaKey || e.ctrlKey) {
    modifiers.push('CmdOrCtrl');
  }
  if (e.altKey) {
    modifiers.push('Alt');
  }
  if (e.shiftKey) {
    modifiers.push('Shift');
  }

  // 忽略单独的修饰键
  const ignoredKeys = ['Control', 'Alt', 'Shift', 'Meta', 'CapsLock', 'Tab', 'Escape'];
  if (ignoredKeys.includes(e.key)) {
    return null;
  }

  // 需要至少一个修饰键
  if (modifiers.length === 0) {
    return null;
  }

  // 获取按键
  let key = e.key;

  // 处理特殊键
  if (key === ' ') {
    key = 'Space';
  } else if (key.length === 1) {
    key = key.toUpperCase();
  } else {
    // 处理功能键等
    key = key.charAt(0).toUpperCase() + key.slice(1);
  }

  return [...modifiers, key].join('+');
}

interface ShortcutInputProps {
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
  defaultValue: string;
  pressShortcutText: string;
  restoreDefaultText: string;
}

const ShortcutInput: React.FC<ShortcutInputProps> = ({ value, onChange, onReset, defaultValue, pressShortcutText, restoreDefaultText }) => {
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const shortcut = keyEventToShortcut(e);
    if (shortcut) {
      onChange(shortcut);
      setIsRecording(false);
    }
  }, [onChange]);

  useEffect(() => {
    if (isRecording) {
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isRecording, handleKeyDown]);

  // 点击外部取消录制
  useEffect(() => {
    if (isRecording) {
      const handleClickOutside = (e: MouseEvent) => {
        if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
          setIsRecording(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isRecording]);

  const isDefault = value === defaultValue;

  return (
    <div className="flex items-center gap-2">
      <div
        ref={inputRef}
        onClick={() => setIsRecording(true)}
        className={`
          flex-1 px-3 py-2 rounded-lg text-sm cursor-pointer select-none
          transition-all duration-150
          ${isRecording
            ? 'bg-primary/20 border-2 border-primary text-primary'
            : 'bg-muted border border-border text-foreground hover:bg-accent'
          }
        `}
      >
        {isRecording ? (
          <span className="text-primary">{pressShortcutText}</span>
        ) : (
          <span className="font-mono">{formatShortcut(value)}</span>
        )}
      </div>
      {!isDefault && (
        <button
          onClick={onReset}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          title={restoreDefaultText}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

const ShortcutsSettings: React.FC = () => {
  const { formData, setFormData } = useSettingsStore();
  const { t } = useTranslation('settings');

  // 快捷键配置项
  const SHORTCUT_ITEMS: { key: keyof Shortcuts; label: string; description: string }[] = [
    {
      key: 'newSession',
      label: t('shortcuts.newSession'),
      description: t('shortcuts.newSessionDesc'),
    },
    {
      key: 'openSettings',
      label: t('shortcuts.openCloseSettings'),
      description: t('shortcuts.openCloseSettingsDesc'),
    },
  ];

  const handleShortcutChange = (key: keyof Shortcuts, value: string) => {
    setFormData({
      shortcuts: {
        ...formData.shortcuts,
        [key]: value,
      },
    });
  };

  const handleReset = (key: keyof Shortcuts) => {
    setFormData({
      shortcuts: {
        ...formData.shortcuts,
        [key]: DEFAULT_SHORTCUTS[key],
      },
    });
  };

  const handleResetAll = () => {
    setFormData({
      shortcuts: DEFAULT_SHORTCUTS,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t('shortcuts.clickShortcutArea')}
        </p>
        <button
          onClick={handleResetAll}
          className="text-sm text-primary hover:text-primary/80 transition-colors"
        >
          {t('shortcuts.restoreAllDefaults')}
        </button>
      </div>

      <div className="space-y-4">
        {SHORTCUT_ITEMS.map((item) => (
          <div key={item.key} className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-foreground">
                {item.label}
              </label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {item.description}
              </p>
            </div>
            <div className="w-48">
              <ShortcutInput
                value={formData.shortcuts?.[item.key] || DEFAULT_SHORTCUTS[item.key]}
                onChange={(value) => handleShortcutChange(item.key, value)}
                onReset={() => handleReset(item.key)}
                defaultValue={DEFAULT_SHORTCUTS[item.key]}
                pressShortcutText={t('shortcuts.pressShortcut')}
                restoreDefaultText={t('shortcuts.restoreDefault')}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ShortcutsSettings;
