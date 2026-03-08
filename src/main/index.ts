import { app, BrowserWindow, Menu, dialog, session, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import started from 'electron-squirrel-startup';
import { nanoid } from 'nanoid';
import mainI18n from './i18n';
import { SessionStore } from './store/session-store';
import { Persistence } from './store/persistence';
import { ConfigStore } from './store/config-store';
import { createDefaultToolRegistry } from './tools/tool-registry';
import { AgentService } from './agent/agent-service';
import { EventAdapter } from './agent/event-adapter';
import { PushService, bridgeSessionStoreToPush } from './ipc/push';
import { SkillsStore } from './skills';
import { registerIpcHandlers, removeIpcHandlers } from './ipc/services';
import type { Shortcuts } from '@shared/schemas';
import type { Session } from '@shared/types';

// Register built-in AI providers
import '../ai/providers/register-builtins';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

app.setName('Amon');

// ==================== Paths ====================

const DATA_DIR = path.join(os.homedir(), '.amon');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const DEFAULT_WORKSPACE = path.join(DATA_DIR, 'workspace');

// ==================== Services (sync init) ====================

const sessionStore = new SessionStore();
const persistence = new Persistence(SESSIONS_DIR);
const configStore = new ConfigStore(SETTINGS_PATH);
const skillsStore = new SkillsStore(configStore);
const toolRegistry = createDefaultToolRegistry(configStore);
const pushService = new PushService();
const eventAdapter = new EventAdapter(sessionStore, pushService);

// Bridge SessionStore events → PushService (before any window is created)
bridgeSessionStoreToPush(sessionStore, pushService);

// These are initialized async in app.on('ready')
let agentService: AgentService;

// ==================== CLI Workspace ====================

let cliWorkspace: string | undefined;

function parseCliWorkspace(): string | undefined {
  const args = process.argv.slice(app.isPackaged ? 1 : 2);

  for (const arg of args) {
    if (arg.startsWith('-')) continue;
    if (arg.endsWith('.js')) continue;

    if (arg === '.') {
      return process.cwd();
    }

    const resolvedPath = path.isAbsolute(arg)
      ? arg
      : path.resolve(process.cwd(), arg);

    try {
      const stat = fs.statSync(resolvedPath);
      if (stat.isDirectory()) {
        return resolvedPath;
      }
    } catch {
      // path not found
    }
  }

  return undefined;
}

// ==================== Vite Variables ====================

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
declare const SETTINGS_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const SETTINGS_WINDOW_VITE_NAME: string;

// ==================== Window Management ====================

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;

function createWindow(): void {
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

  // Wire PushService to main window
  pushService.setWindow(mainWindow);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  if (process.env.NODE_ENV === 'development' || MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }

  // 拦截外部链接：用系统默认浏览器打开，而非在 Electron 内开新窗口
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

export function openSettingsWindow(tab?: string): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    if (tab) {
      const currentURL = settingsWindow.webContents.getURL();
      const newURL = currentURL.split('#')[0] + '#' + tab;
      settingsWindow.loadURL(newURL);
    }
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
    title: mainI18n.t('settingsWindowTitle'),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  settingsWindow.once('ready-to-show', () => {
    settingsWindow?.show();
  });

  const hash = tab ? `#${tab}` : '';
  if (SETTINGS_WINDOW_VITE_DEV_SERVER_URL) {
    settingsWindow.loadURL(`${SETTINGS_WINDOW_VITE_DEV_SERVER_URL}/settings.html${hash}`);
  } else {
    settingsWindow.loadFile(
      path.join(__dirname, `../renderer/${SETTINGS_WINDOW_VITE_NAME}/settings.html`),
      { hash: tab || '' }
    );
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

export function closeSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
    settingsWindow = null;
  }
}

function toggleSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    closeSettingsWindow();
  } else {
    openSettingsWindow();
  }
}

// ==================== App Menu ====================

async function createAppMenu(shortcuts?: Shortcuts): Promise<void> {
  const settings = shortcuts ? { shortcuts } : await configStore.getSettings();
  const shortcutConfig = settings.shortcuts;

  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        {
          label: mainI18n.t('settings'),
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

    {
      label: mainI18n.t('file'),
      submenu: [
        {
          label: mainI18n.t('newSession'),
          accelerator: shortcutConfig.newSession,
          click: async () => {
            const session: Session = {
              id: nanoid(),
              title: 'New Session',
              workspace: DEFAULT_WORKSPACE,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            sessionStore.createSession(session);
            await persistence.createSession(session);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.focus();
            }
          },
        },
        { type: 'separator' },
        ...(!isMac ? [
          {
            label: mainI18n.t('settings'),
            accelerator: shortcutConfig.openSettings,
            click: () => toggleSettingsWindow(),
          },
          { type: 'separator' as const },
        ] : []),
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },

    {
      label: mainI18n.t('edit'),
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

    {
      label: mainI18n.t('view'),
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

    {
      label: mainI18n.t('window'),
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
}

// ==================== App Lifecycle ====================

app.on('ready', async () => {
  cliWorkspace = parseCliWorkspace();

  // Ensure data directories exist
  await fs.promises.mkdir(SESSIONS_DIR, { recursive: true });
  await fs.promises.mkdir(DEFAULT_WORKSPACE, { recursive: true });

  // Load settings → init i18n
  const savedSettings = await configStore.getSettings();
  mainI18n.changeLanguage(savedSettings.language);

  mainI18n.on('languageChanged', () => {
    createAppMenu();
  });

  // Load all session metas from disk into SessionStore
  const sessions = await persistence.loadAllSessionMetas();
  for (const session of sessions) {
    sessionStore.createSession(session);
    // Load messages for each session
    const state = await persistence.loadSession(session.id);
    if (state) {
      sessionStore.loadSessionState(state);
    }
  }

  // Create AgentService
  agentService = new AgentService({
    sessionStore,
    persistence,
    configStore,
    toolRegistry,
    skillsStore,
    eventAdapter,
    pushService,
    dataDir: DATA_DIR,
    defaultWorkspace: DEFAULT_WORKSPACE,
  });

  // Register IPC handlers
  registerIpcHandlers({
    agentService,
    sessionStore,
    persistence,
    configStore,
    pushService,
    skillsStore,
    getMainWindow: () => mainWindow,
    getSettingsWindow: () => settingsWindow,
    createSettingsWindow: (tab?: string) => openSettingsWindow(tab),
  });

  // 允许 renderer 跨域请求外部资源（图片下载等）
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    headers['Access-Control-Allow-Origin'] = ['*'];
    callback({ responseHeaders: headers });
  });

  // 处理文件下载：弹出保存对话框
  session.defaultSession.on('will-download', (_event, item) => {
    const defaultPath = item.getFilename();
    const result = dialog.showSaveDialogSync(mainWindow!, {
      defaultPath,
    });
    if (result) {
      item.setSavePath(result);
    } else {
      item.cancel();
    }
  });

  // First-launch: install default built-in skills
  await skillsStore.initializeBuiltinSkills();

  // Create main window
  createWindow();

  // Create app menu
  await createAppMenu();

  // Handle CLI workspace
  if (cliWorkspace && mainWindow) {
    mainWindow.webContents.once('did-finish-load', async () => {
      if (!cliWorkspace) return;

      const session: Session = {
        id: nanoid(),
        title: 'New Session',
        workspace: cliWorkspace,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      sessionStore.createSession(session);
      await persistence.createSession(session);
      console.log(`CLI: Created session with workspace: ${cliWorkspace}`);
    });
  }
});

app.on('window-all-closed', () => {
  removeIpcHandlers();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
