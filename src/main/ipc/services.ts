import { ipcMain, BrowserWindow, dialog, shell, app } from 'electron';
import type { Session, ImageAttachment, SkillInfo } from '@shared/types';
import type { Settings } from '@shared/schemas';
import type { AgentService } from '../agent/agent-service';
import type { SessionStore } from '../store/session-store';
import type { Persistence } from '../store/persistence';
import type { ConfigStore } from '../store/config-store';
import type { SkillsStore } from '../skills';
import type { PushService } from './push';
import { nanoid } from 'nanoid';
import path from 'path';
import os from 'os';

// ==================== IPC Handler 类型工具 ====================

type IpcHandler = (...args: unknown[]) => unknown | Promise<unknown>;

function handle(channel: string, handler: IpcHandler): void {
  ipcMain.handle(channel, (_event, ...args) => handler(...args));
}

// ==================== 依赖注入接口 ====================

export interface IpcDependencies {
  agentService: AgentService;
  sessionStore: SessionStore;
  persistence: Persistence;
  configStore: ConfigStore;
  pushService: PushService;
  skillsStore: SkillsStore;
  getMainWindow: () => BrowserWindow | null;
  getSettingsWindow: () => BrowserWindow | null;
  createSettingsWindow: (tab?: string) => void;
}

// ==================== 注册所有 IPC Handlers ====================

export function registerIpcHandlers(deps: IpcDependencies): void {
  registerAgentHandlers(deps);
  registerSessionHandlers(deps);
  registerSettingsHandlers(deps);
  registerSystemHandlers(deps);
  registerWorkspaceHandlers(deps);
  registerDialogHandlers();
  registerSkillsHandlers(deps);
}

// ==================== Agent Handlers ====================

function registerAgentHandlers(deps: IpcDependencies): void {
  handle('agent.sendMessage', async (prompt: unknown, sessionId: unknown, images?: unknown) => {
    await deps.agentService.sendMessage(
      sessionId as string,
      prompt as string,
      images as ImageAttachment[] | undefined,
    );
  });

  handle('agent.interrupt', async (sessionId: unknown) => {
    deps.agentService.abort(sessionId as string);
  });
}

// ==================== Session Handlers ====================

function registerSessionHandlers(deps: IpcDependencies): void {
  handle('session.list', async () => {
    return deps.sessionStore.getAllSessions();
  });

  handle('session.create', async (workspace?: unknown) => {
    let ws = workspace as string | undefined;
    if (!ws) {
      const settings = await deps.configStore.getSettings();
      const defaultWs = settings.workspaces.find(w => w.isDefault);
      ws = defaultWs?.path ?? path.join(os.homedir(), '.amon', 'workspace');
    }
    const session: Session = {
      id: nanoid(),
      title: 'New Session',
      workspace: ws,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    deps.sessionStore.createSession(session);
    await deps.persistence.createSession(session);
    return session;
  });

  handle('session.delete', async (sessionId: unknown) => {
    deps.agentService.removeAgent(sessionId as string);
    deps.sessionStore.deleteSession(sessionId as string);
    await deps.persistence.deleteSession(sessionId as string);
  });

  handle('session.rename', async (sessionId: unknown, title: unknown) => {
    deps.sessionStore.renameSession(sessionId as string, title as string);
    await deps.persistence.appendMetaUpdate(sessionId as string, { title: title as string });
  });

  handle('session.getMessages', async (sessionId: unknown) => {
    return deps.sessionStore.getMessages(sessionId as string);
  });

  handle('session.updateWorkspace', async (sessionId: unknown, workspace: unknown) => {
    deps.sessionStore.updateSessionWorkspace(sessionId as string, workspace as string);
    await deps.persistence.appendMetaUpdate(sessionId as string, { workspace: workspace as string });
  });
}

// ==================== Settings Handlers ====================

function registerSettingsHandlers(deps: IpcDependencies): void {
  handle('settings.get', async () => {
    return deps.configStore.getSettings();
  });

  handle('settings.set', async (updates: unknown) => {
    const result = await deps.configStore.updateSettings(updates as Partial<Settings>);
    deps.pushService.pushSettingsChanged();
    return { success: true, data: result };
  });
}

// ==================== System Handlers ====================

function registerSystemHandlers(deps: IpcDependencies): void {
  handle('system.openSettings', async (tab?: unknown) => {
    deps.createSettingsWindow(tab as string | undefined);
  });

  handle('system.closeSettings', async () => {
    const settingsWin = deps.getSettingsWindow();
    if (settingsWin) settingsWin.close();
  });

  handle('system.openConfigDir', async () => {
    const configDir = path.join(os.homedir(), '.amon');
    await shell.openPath(configDir);
  });

  handle('system.openPath', async (filePath: unknown) => {
    await shell.openPath(filePath as string);
  });

  handle('system.openExternal', async (url: unknown) => {
    await shell.openExternal(url as string);
  });

  handle('system.getVersion', async () => {
    return app.getVersion();
  });
}

// ==================== Workspace Handlers ====================

function registerWorkspaceHandlers(deps: IpcDependencies): void {
  handle('workspace.listFiles', async (workspacePath: unknown, query?: unknown) => {
    return [];
  });

  handle('workspace.validatePaths', async (paths: unknown) => {
    return (paths as string[]).map(() => true);
  });
}

// ==================== Dialog Handlers ====================

function registerDialogHandlers(): void {
  handle('dialog.selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  handle('dialog.selectImages', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
    });
    return result.canceled ? [] : result.filePaths;
  });

}

// ==================== Skills Handlers ====================

function registerSkillsHandlers(deps: IpcDependencies): void {
  // skills.list -- get installed skills + built-in skills metadata
  handle('skills.list', async (workspace?: unknown) => {
    const ws = workspace as string | undefined;
    const settings = await deps.configStore.getSettings();
    const disabledSkills = settings.skills.disabledSkills;

    // Load installed skills (needs workspace)
    if (ws) {
      await deps.skillsStore.load(ws);
    }
    const installed = deps.skillsStore.getSkills();
    const installedInfo: SkillInfo[] = installed.map(s => ({
      name: s.name,
      description: s.description,
      source: s.source,
      dirPath: s.baseDir,
      disabled: disabledSkills.includes(s.name),
      sourceLabel: s.source === 'project-amon'
        ? path.basename(path.dirname(path.dirname(s.baseDir)))
        : 'global',
    }));

    // Get built-in skills list
    const builtin = deps.skillsStore.getBuiltinSkills();

    return { installed: installedInfo, builtin };
  });

  // skills.getContent -- get SKILL.md content
  handle('skills.getContent', async (dirPath: unknown) => {
    const skillFile = path.join(dirPath as string, 'SKILL.md');
    return deps.skillsStore.readSkillContent(skillFile);
  });

  // skills.install -- install a built-in skill
  handle('skills.install', async (name: unknown) => {
    await deps.skillsStore.installBuiltinSkill(name as string);
    deps.pushService.pushSkillsChanged();
  });

  // skills.uninstall -- uninstall a skill
  handle('skills.uninstall', async (name: unknown) => {
    await deps.skillsStore.uninstallSkill(name as string);
    deps.pushService.pushSkillsChanged();
  });

  // skills.toggleDisable -- toggle skill disable state
  handle('skills.toggleDisable', async (name: unknown, disabled: unknown) => {
    const settings = await deps.configStore.getSettings();
    let disabledSkills = [...settings.skills.disabledSkills];
    if (disabled) {
      if (!disabledSkills.includes(name as string)) {
        disabledSkills.push(name as string);
      }
    } else {
      disabledSkills = disabledSkills.filter(n => n !== (name as string));
    }
    await deps.configStore.updateSettings({
      skills: { ...settings.skills, disabledSkills },
    });
    deps.pushService.pushSettingsChanged();
  });

  // skills.openFolder -- open skill directory in system file manager
  handle('skills.openFolder', async (dirPath: unknown) => {
    await shell.openPath(dirPath as string);
  });
}

// ==================== 清理 ====================

export function removeIpcHandlers(): void {
  const channels = [
    'agent.sendMessage', 'agent.interrupt',
    'session.list', 'session.create', 'session.delete', 'session.rename',
    'session.getMessages', 'session.updateWorkspace',
    'settings.get', 'settings.set',
    'system.openSettings', 'system.closeSettings', 'system.openConfigDir',
    'system.openPath', 'system.openExternal', 'system.getVersion',
    'workspace.listFiles', 'workspace.validatePaths',
    'dialog.selectFolder', 'dialog.selectImages',
    'skills.list', 'skills.getContent', 'skills.install',
    'skills.uninstall', 'skills.toggleDisable', 'skills.openFolder',
  ];
  for (const ch of channels) {
    ipcMain.removeHandler(ch);
  }
}
