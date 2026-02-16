import { ipcMain, shell, app } from 'electron';
import os from 'os';
import { IPC_CHANNELS } from '../../shared/ipc';
import { openSettingsWindow, closeSettingsWindow } from '../index';
import * as configStore from '../store/configStore';
import { createLogger } from '../store/logger';

const log = createLogger('IpcHandlers:System');

export function registerSystemHandlers(): void {
  // ========== 窗口相关 ==========

  // 打开设置窗口
  ipcMain.handle(IPC_CHANNELS.WINDOW_OPEN_SETTINGS, (_event, tab?: string) => {
    openSettingsWindow(tab);
    return { success: true };
  });

  // 关闭设置窗口
  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE_SETTINGS, () => {
    closeSettingsWindow();
    return { success: true };
  });

  // ========== Shell 相关 ==========

  // 打开配置目录
  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_CONFIG_DIR, async () => {
    const configDir = configStore.getConfigDir();
    await shell.openPath(configDir);
    return { success: true };
  });

  // 在文件管理器中打开指定路径（打开文件夹内部）
  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_PATH, async (_event, path: string) => {
    // 展开 ~ 为用户主目录
    const expandedPath = path.startsWith('~')
      ? path.replace('~', os.homedir())
      : path;
    await shell.openPath(expandedPath);
    return { success: true };
  });

  // 在默认浏览器中打开外部链接
  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, async (_event, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      log.error('IPC: Failed to open external URL', error instanceof Error ? { message: error.message, url } : { url });
      return { success: false };
    }
  });

  // ========== 应用信息相关 ==========

  // 获取应用版本号
  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, async () => {
    try {
      // 优先使用 Electron app.getVersion()
      const version = app.getVersion();
      return { success: true, version };
    } catch (error) {
      log.error('IPC: Failed to get app version', error instanceof Error ? { message: error.message } : error);
      return { success: false, version: '0.0.0' };
    }
  });
}
