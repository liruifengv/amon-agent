import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { DEFAULT_SHORTCUTS, Shortcuts } from '../../types';
import { RotateCcw } from 'lucide-react';

// 快捷键配置项
const SHORTCUT_ITEMS: { key: keyof Shortcuts; label: string; description: string }[] = [
  {
    key: 'newSession',
    label: '新建会话',
    description: '创建一个新的聊天会话',
  },
  {
    key: 'openSettings',
    label: '打开/关闭设置',
    description: '切换设置窗口',
  },
];

// 将 Electron 快捷键格式转换为显示格式
function formatShortcut(shortcut: string): string {
  if (!shortcut) return '';

  const isMac = navigator.platform.toLowerCase().includes('mac');

  return shortcut
    .replace(/CmdOrCtrl/g, isMac ? '⌘' : 'Ctrl')
    .replace(/Cmd/g, '⌘')
    .replace(/Ctrl/g, isMac ? '⌃' : 'Ctrl')
    .replace(/Alt/g, isMac ? '⌥' : 'Alt')
    .replace(/Shift/g, isMac ? '⇧' : 'Shift')
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
}

const ShortcutInput: React.FC<ShortcutInputProps> = ({ value, onChange, onReset, defaultValue }) => {
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
            ? 'bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-500 text-primary-700 dark:text-primary-300'
            : 'bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
          }
        `}
      >
        {isRecording ? (
          <span className="text-primary-500 dark:text-primary-400">按下快捷键...</span>
        ) : (
          <span className="font-mono">{formatShortcut(value)}</span>
        )}
      </div>
      {!isDefault && (
        <button
          onClick={onReset}
          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title="恢复默认"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

const ShortcutsSettings: React.FC = () => {
  const { formData, setFormData } = useSettingsStore();

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
        <p className="text-sm text-gray-500 dark:text-gray-400">
          点击快捷键区域，然后按下新的快捷键组合来更改
        </p>
        <button
          onClick={handleResetAll}
          className="text-sm text-primary-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
        >
          全部恢复默认
        </button>
      </div>

      <div className="space-y-4">
        {SHORTCUT_ITEMS.map((item) => (
          <div key={item.key} className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                {item.label}
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {item.description}
              </p>
            </div>
            <div className="w-48">
              <ShortcutInput
                value={formData.shortcuts?.[item.key] || DEFAULT_SHORTCUTS[item.key]}
                onChange={(value) => handleShortcutChange(item.key, value)}
                onReset={() => handleReset(item.key)}
                defaultValue={DEFAULT_SHORTCUTS[item.key]}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ShortcutsSettings;
