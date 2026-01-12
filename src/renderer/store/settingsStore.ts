import { create } from 'zustand';
import type { Settings, AgentSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

interface SettingsState {
  settings: Settings;
  formData: Settings; // 表单本地状态
  isLoading: boolean;
  saveError: { field: string; message: string }[] | null;
  isSaving: boolean;
  hasChanges: boolean; // 是否有未保存的变更

  // Actions
  setSettings: (settings: Settings) => void;
  setFormData: (updates: Partial<Settings>) => void;
  setAgentFormData: (updates: Partial<AgentSettings>) => void;
  resetFormData: () => void;
  saveSettings: () => Promise<boolean>;
  saveTheme: (theme: 'light' | 'dark' | 'system') => Promise<boolean>;
  loadSettings: () => Promise<void>;
  clearSaveError: () => void;
}

// 应用主题
function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  const root = document.documentElement;

  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', isDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}

// 检查两个设置对象是否相等
function areSettingsEqual(a: Settings, b: Settings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  formData: DEFAULT_SETTINGS,
  isLoading: true,
  saveError: null,
  isSaving: false,
  hasChanges: false,

  setSettings: (settings) =>
    set({ settings, formData: settings, hasChanges: false }),

  setFormData: (updates) =>
    set((state) => {
      const newFormData = { ...state.formData, ...updates };
      const hasChanges = !areSettingsEqual(newFormData, state.settings);
      return { formData: newFormData, hasChanges };
    }),

  setAgentFormData: (updates) =>
    set((state) => {
      const newFormData = {
        ...state.formData,
        agent: { ...state.formData.agent, ...updates },
      };
      const hasChanges = !areSettingsEqual(newFormData, state.settings);
      return { formData: newFormData, hasChanges };
    }),

  resetFormData: () => {
    const { settings } = get();
    set({ formData: settings, saveError: null, hasChanges: false });
  },

  saveSettings: async () => {
    const { formData } = get();
    set({ isSaving: true, saveError: null });

    try {
      const result = await window.electronAPI.settings.set(formData);

      if (result.success && result.data) {
        // 同时更新 settings 和 formData，确保与后端返回的数据一致
        set({ settings: result.data, formData: result.data, isSaving: false, hasChanges: false });
        return true;
      } else {
        set({ saveError: result.errors || null, isSaving: false });
        return false;
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      set({
        saveError: [{ field: '_global', message: '保存失败，请稍后重试' }],
        isSaving: false,
      });
      return false;
    }
  },

  saveTheme: async (theme) => {
    const { settings } = get();
    const newSettings = { ...settings, theme };

    try {
      const result = await window.electronAPI.settings.set(newSettings);

      if (result.success && result.data) {
        set({ settings: result.data, formData: { ...get().formData, theme } });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to save theme:', error);
      return false;
    }
  },

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      const settings = await window.electronAPI.settings.get();
      set({ settings, formData: settings, isLoading: false, hasChanges: false });
      applyTheme(settings.theme);
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ isLoading: false });
    }
  },

  clearSaveError: () => set({ saveError: null }),
}));

// 空操作函数
const noop = () => { /* no cleanup needed */ };

// 防止重复注册的标志
let listenersInitialized = false;

/**
 * 初始化设置相关的全局监听器
 * 应该只在应用启动时调用一次
 */
export function initSettingsListeners(): () => void {
  if (listenersInitialized || typeof window === 'undefined') {
    return noop;
  }
  listenersInitialized = true;

  // 监听系统主题变化
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleThemeChange = (e: MediaQueryListEvent) => {
    const { settings } = useSettingsStore.getState();
    if (settings.theme === 'system') {
      document.documentElement.classList.toggle('dark', e.matches);
    }
  };
  mediaQuery.addEventListener('change', handleThemeChange);

  // 监听设置变更广播（来自其他窗口）
  const handleSettingsChange = (newSettings: Settings) => {
    useSettingsStore.getState().setSettings(newSettings);
    applyTheme(newSettings.theme);
  };
  window.electronAPI.settings.onChange(handleSettingsChange);

  // 返回清理函数
  return () => {
    mediaQuery.removeEventListener('change', handleThemeChange);
    window.electronAPI.settings.offChange(handleSettingsChange);
    listenersInitialized = false;
  };
}
