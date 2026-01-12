import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers, removeIpcHandlers } from './ipc/handlers';
import { IPC_CHANNELS } from '../shared/ipc';
import { getSettings } from './store/configStore';
import { sessionStore } from './store/sessionStore';
import { persistence } from './store/persistence';
import type { Shortcuts } from '../shared/types';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// 设置应用名称（开发模式下默认显示 "Electron"）
app.setName('Amon');

// CLI 工作空间路径（命令行参数解析结果）
let cliWorkspace: string | undefined;

/**
 * 解析命令行参数，获取工作空间路径
 * 支持 `amon .` 和 `amon /path/to/workspace`
 */
function parseCliWorkspace(): string | undefined {
  // 开发环境和打包环境的参数位置不同
  const args = process.argv.slice(app.isPackaged ? 1 : 2);

  for (const arg of args) {
    // 跳过 Electron 的参数（以 - 开头）
    if (arg.startsWith('-')) continue;
    // 跳过 .js 文件（开发环境的入口文件）
    if (arg.endsWith('.js')) continue;

    // 处理 `.`（当前目录）
    if (arg === '.') {
      return process.cwd();
    }

    // 解析路径
    const resolvedPath = path.isAbsolute(arg)
      ? arg
      : path.resolve(process.cwd(), arg);

    // 验证路径存在且是目录
    try {
      const stat = fs.statSync(resolvedPath);
      if (stat.isDirectory()) {
        return resolvedPath;
      }
    } catch {
      // 路径不存在或无法访问
    }
  }

  return undefined;
}

// Declare the variables injected by Vite
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
declare const SETTINGS_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const SETTINGS_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;

/**
 * 创建应用菜单（快捷键只在应用激活时生效）
 */
export async function createAppMenu(shortcuts?: Shortcuts): Promise<void> {
  // 如果没有传入快捷键配置，从设置中获取
  const settings = shortcuts ? { shortcuts } : await getSettings();
  const shortcutConfig = settings.shortcuts;

  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    // macOS 应用菜单
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        {
          label: '设置...',
          accelerator: shortcutConfig.openSettings,
          click: () => toggleSettingsWindow(),
        },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),

    // 文件菜单
    {
      label: '文件',
      submenu: [
        {
          label: '新建会话',
          accelerator: shortcutConfig.newSession,
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send(IPC_CHANNELS.SHORTCUT_NEW_SESSION);
              mainWindow.focus();
            }
          },
        },
        { type: 'separator' },
        ...(!isMac ? [
          {
            label: '设置...',
            accelerator: shortcutConfig.openSettings,
            click: () => toggleSettingsWindow(),
          },
          { type: 'separator' as const },
        ] : []),
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },

    // 编辑菜单
    {
      label: '编辑',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' as const },
          { role: 'delete' as const },
          { role: 'selectAll' as const },
        ] : [
          { role: 'delete' as const },
          { type: 'separator' as const },
          { role: 'selectAll' as const },
        ]),
      ],
    },

    // 视图菜单
    {
      label: '视图',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },

    // 窗口菜单
    {
      label: '窗口',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
          { type: 'separator' as const },
          { role: 'window' as const },
        ] : [
          { role: 'close' as const },
        ]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  console.log(`App menu created with shortcuts: newSession=${shortcutConfig.newSession}, openSettings=${shortcutConfig.openSettings}`);
}

/**
 * 更新快捷键（重新创建菜单）
 */
export async function registerShortcuts(shortcuts?: Shortcuts): Promise<void> {
  await createAppMenu(shortcuts);
}

/**
 * 注销快捷键（空操作，菜单快捷键不需要手动注销）
 */
export function unregisterShortcuts(): void {
  // 菜单快捷键随应用生命周期自动管理，无需手动注销
}

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Register IPC handlers
  registerIpcHandlers(mainWindow);

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools in development.
  if (process.env.NODE_ENV === 'development' || MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

/**
 * 打开设置窗口
 */
export function openSettingsWindow(): void {
  // 如果窗口已存在，聚焦
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 800,
    minHeight: 550,
    resizable: true,
    show: false,
    backgroundColor: '#ffffff',
    title: '设置',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 内容加载完成后再显示窗口
  settingsWindow.once('ready-to-show', () => {
    settingsWindow?.show();
  });

  // 加载设置页面
  if (SETTINGS_WINDOW_VITE_DEV_SERVER_URL) {
    settingsWindow.loadURL(`${SETTINGS_WINDOW_VITE_DEV_SERVER_URL}/settings.html`);
  } else {
    settingsWindow.loadFile(
      path.join(__dirname, `../renderer/${SETTINGS_WINDOW_VITE_NAME}/settings.html`),
    );
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

/**
 * 关闭设置窗口
 */
export function closeSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
    settingsWindow = null;
  }
}

/**
 * 切换设置窗口（打开/关闭）
 */
export function toggleSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    closeSettingsWindow();
  } else {
    openSettingsWindow();
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  // 解析 CLI 参数
  cliWorkspace = parseCliWorkspace();

  // 确保默认工作空间目录存在
  await persistence.ensureDefaultWorkspace();

  createWindow();

  // 创建应用菜单（包含快捷键）
  await registerShortcuts();

  // 如果有 CLI 工作空间参数，在窗口加载完成后创建新会话
  if (cliWorkspace && mainWindow) {
    mainWindow.webContents.once('did-finish-load', async () => {
      if (cliWorkspace) {
        // 加载所有会话
        await sessionStore.loadAllSessions();
        // 创建新会话
        const session = await sessionStore.createSession(undefined, cliWorkspace);
        // 通知渲染进程切换到新会话
        mainWindow?.webContents.send('cli:sessionCreated', { sessionId: session.id });
        console.log(`CLI: Created session with workspace: ${cliWorkspace}`);
      }
    });
  }
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  removeIpcHandlers();
  unregisterShortcuts();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
