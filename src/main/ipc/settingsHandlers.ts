import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { Settings, SettingsSetResult } from '../../shared/types';
import * as configStore from '../store/configStore';
import { registerShortcuts } from '../index';
import mainI18n from '../i18n';

export function registerSettingsHandlers(): void {
  // 获取设置
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    return await configStore.getSettings();
  });

  // 保存设置
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, settings: Partial<Settings>): Promise<SettingsSetResult> => {
    try {
      const newSettings = await configStore.setSettings(settings);
      // 广播设置变更到所有窗口
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, newSettings);
      });
      // 如果快捷键配置有变更，重新注册快捷键
      if (settings.shortcuts) {
        await registerShortcuts(newSettings.shortcuts);
      }
      // 如果语言设置有变更，同步主进程 i18n（菜单重建由 languageChanged 事件自动触发）
      if (settings.language) {
        mainI18n.changeLanguage(newSettings.language);
      }
      return { success: true, data: newSettings };
    } catch (error) {
      if (error instanceof configStore.SettingsValidationFailedError) {
        return { success: false, errors: error.errors };
      }
      // 其他错误
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, errors: [{ field: '_global', message }] };
    }
  });
}
