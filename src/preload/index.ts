import { contextBridge, ipcRenderer } from 'electron';
import type { PushEventMap } from '../shared/ipc-types';

// ==================== IPC Helper ====================

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  return ipcRenderer.invoke(channel, ...args);
}

// ==================== IPC API (Request/Response) ====================
// contextBridge requires explicit function objects — Proxy does not survive serialization.

const ipc = {
  agent: {
    sendMessage: (...args: unknown[]) => invoke('agent.sendMessage', ...args),
    interrupt: (...args: unknown[]) => invoke('agent.interrupt', ...args),
  },
  session: {
    list: () => invoke('session.list'),
    create: (...args: unknown[]) => invoke('session.create', ...args),
    delete: (...args: unknown[]) => invoke('session.delete', ...args),
    rename: (...args: unknown[]) => invoke('session.rename', ...args),
    getMessages: (...args: unknown[]) => invoke('session.getMessages', ...args),
    updateWorkspace: (...args: unknown[]) => invoke('session.updateWorkspace', ...args),
  },
  settings: {
    get: () => invoke('settings.get'),
    set: (...args: unknown[]) => invoke('settings.set', ...args),
  },
  system: {
    openSettings: (...args: unknown[]) => invoke('system.openSettings', ...args),
    closeSettings: () => invoke('system.closeSettings'),
    openConfigDir: () => invoke('system.openConfigDir'),
    openPath: (...args: unknown[]) => invoke('system.openPath', ...args),
    openExternal: (...args: unknown[]) => invoke('system.openExternal', ...args),
    getVersion: () => invoke('system.getVersion'),
  },
  workspace: {
    listFiles: (...args: unknown[]) => invoke('workspace.listFiles', ...args),
    validatePaths: (...args: unknown[]) => invoke('workspace.validatePaths', ...args),
  },
  dialog: {
    selectFolder: () => invoke('dialog.selectFolder'),
    selectImages: () => invoke('dialog.selectImages'),
  },
  skills: {
    list: (...args: unknown[]) => invoke('skills.list', ...args),
    getContent: (...args: unknown[]) => invoke('skills.getContent', ...args),
    install: (...args: unknown[]) => invoke('skills.install', ...args),
    uninstall: (...args: unknown[]) => invoke('skills.uninstall', ...args),
    toggleDisable: (...args: unknown[]) => invoke('skills.toggleDisable', ...args),
    openFolder: (...args: unknown[]) => invoke('skills.openFolder', ...args),
  },
};

// ==================== Push Layer (Main -> Renderer) ====================

const push = {
  on: <K extends keyof PushEventMap>(
    channel: K,
    callback: (data: PushEventMap[K]) => void,
  ): (() => void) => {
    const handler = (_event: unknown, data: PushEventMap[K]) => callback(data);
    ipcRenderer.on(channel, handler as Parameters<typeof ipcRenderer.on>[1]);
    return () => {
      ipcRenderer.removeListener(channel, handler as Parameters<typeof ipcRenderer.removeListener>[1]);
    };
  },
};

// ==================== Expose to Renderer ====================

contextBridge.exposeInMainWorld('ipc', ipc);
contextBridge.exposeInMainWorld('push', push);
