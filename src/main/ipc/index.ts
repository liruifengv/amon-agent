import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import { registerAgentHandlers } from './agentHandlers';
import { registerSessionHandlers } from './sessionHandlers';
import { registerSettingsHandlers } from './settingsHandlers';
import { registerSkillsHandlers } from './skillsHandlers';
import { registerSystemHandlers } from './systemHandlers';
import { registerWorkspaceHandlers } from './workspaceHandlers';
import { registerDialogHandlers } from './dialogHandlers';
import { setupSessionStoreListeners } from './pushBridge';

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  registerAgentHandlers();
  registerSessionHandlers();
  registerSettingsHandlers();
  registerSkillsHandlers();
  registerSystemHandlers();
  registerWorkspaceHandlers();
  registerDialogHandlers();
  setupSessionStoreListeners(mainWindow);
}

export function removeIpcHandlers(): void {
  Object.values(IPC_CHANNELS).forEach(channel => {
    // 只移除 handle 类型的通道（不以 push: 开头的）
    if (!channel.startsWith('push:')) {
      ipcMain.removeHandler(channel);
    }
  });
}
