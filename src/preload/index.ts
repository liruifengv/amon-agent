import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc';
import { Settings, Session, Message, SkillsLoadResult, RecommendedSkill, SkillInstallTarget, SettingsSetResult, MessageCompleteData, ImageAttachment, FileInfo, ProviderInfo, ModelInfo } from '../shared/types';

// 推送事件回调类型
type MessagesUpdatedCallback = (data: { sessionId: string; messages: Message[] }) => void;
type MessageStateCallback = (data: { sessionId: string; isLoading: boolean }) => void;
type MessageCompleteCallback = (data: MessageCompleteData) => void;
type MessageErrorCallback = (data: { sessionId: string; error: string }) => void;
type SessionCreatedCallback = (session: Session) => void;
type SessionDeletedCallback = (data: { sessionId: string }) => void;
type SessionUpdatedCallback = (session: Session) => void;
type SettingsChangedCallback = (settings: Settings) => void;

// 回调列表
const messagesUpdatedCallbacks: Set<MessagesUpdatedCallback> = new Set();
const messageStateCallbacks: Set<MessageStateCallback> = new Set();
const messageCompleteCallbacks: Set<MessageCompleteCallback> = new Set();
const messageErrorCallbacks: Set<MessageErrorCallback> = new Set();
const sessionCreatedCallbacks: Set<SessionCreatedCallback> = new Set();
const sessionDeletedCallbacks: Set<SessionDeletedCallback> = new Set();
const sessionUpdatedCallbacks: Set<SessionUpdatedCallback> = new Set();
const settingsChangedCallbacks: Set<SettingsChangedCallback> = new Set();
const newSessionShortcutCallbacks: Set<() => void> = new Set();
const cliSessionCreatedCallbacks: Set<(data: { sessionId: string }) => void> = new Set();

// 监听主进程推送事件
ipcRenderer.on(IPC_CHANNELS.PUSH_MESSAGES_UPDATED, (_event, data) => {
  messagesUpdatedCallbacks.forEach(cb => cb(data));
});

ipcRenderer.on(IPC_CHANNELS.PUSH_MESSAGE_STATE, (_event, data) => {
  messageStateCallbacks.forEach(cb => cb(data));
});

ipcRenderer.on(IPC_CHANNELS.PUSH_MESSAGE_COMPLETE, (_event, data) => {
  messageCompleteCallbacks.forEach(cb => cb(data));
});

ipcRenderer.on(IPC_CHANNELS.PUSH_MESSAGE_ERROR, (_event, data) => {
  messageErrorCallbacks.forEach(cb => cb(data));
});

ipcRenderer.on(IPC_CHANNELS.PUSH_SESSION_CREATED, (_event, session) => {
  sessionCreatedCallbacks.forEach(cb => cb(session));
});

ipcRenderer.on(IPC_CHANNELS.PUSH_SESSION_DELETED, (_event, data) => {
  sessionDeletedCallbacks.forEach(cb => cb(data));
});

ipcRenderer.on(IPC_CHANNELS.PUSH_SESSION_UPDATED, (_event, session) => {
  sessionUpdatedCallbacks.forEach(cb => cb(session));
});

ipcRenderer.on(IPC_CHANNELS.SETTINGS_CHANGED, (_event, settings) => {
  settingsChangedCallbacks.forEach(cb => cb(settings));
});

ipcRenderer.on(IPC_CHANNELS.SHORTCUT_NEW_SESSION, () => {
  newSessionShortcutCallbacks.forEach(cb => cb());
});

// CLI 会话创建事件
ipcRenderer.on('cli:sessionCreated', (_event, data) => {
  cliSessionCreatedCallbacks.forEach(cb => cb(data));
});

// 暴露给渲染进程的 API
const electronAPI = {
  // ========== Agent API ==========
  agent: {
    /**
     * 发送消息
     */
    sendMessage: (
      prompt: string,
      sessionId: string,
      images?: ImageAttachment[]
    ): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.AGENT_SEND_MESSAGE, { prompt, sessionId, images });
    },

    /**
     * 中断指定会话的消息处理
     */
    interrupt: (sessionId: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.AGENT_INTERRUPT, sessionId);
    },

    /**
     * 获取可用 Provider 列表
     */
    getProviders: (): Promise<{ success: boolean; providers: ProviderInfo[] }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.AGENT_GET_PROVIDERS);
    },

    /**
     * 获取指定 Provider 的模型列表
     */
    getModels: (provider: string): Promise<{ success: boolean; models: ModelInfo[] }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.AGENT_GET_MODELS, provider);
    },

    /**
     * 监听消息更新
     */
    onMessagesUpdated: (callback: MessagesUpdatedCallback): void => {
      messagesUpdatedCallbacks.add(callback);
    },

    /**
     * 取消监听消息更新
     */
    offMessagesUpdated: (callback: MessagesUpdatedCallback): void => {
      messagesUpdatedCallbacks.delete(callback);
    },

    /**
     * 监听消息状态变化
     */
    onMessageState: (callback: MessageStateCallback): void => {
      messageStateCallbacks.add(callback);
    },

    /**
     * 取消监听消息状态变化
     */
    offMessageState: (callback: MessageStateCallback): void => {
      messageStateCallbacks.delete(callback);
    },

    /**
     * 监听消息完成
     */
    onMessageComplete: (callback: MessageCompleteCallback): void => {
      messageCompleteCallbacks.add(callback);
    },

    /**
     * 取消监听消息完成
     */
    offMessageComplete: (callback: MessageCompleteCallback): void => {
      messageCompleteCallbacks.delete(callback);
    },

    /**
     * 监听消息错误
     */
    onMessageError: (callback: MessageErrorCallback): void => {
      messageErrorCallbacks.add(callback);
    },

    /**
     * 取消监听消息错误
     */
    offMessageError: (callback: MessageErrorCallback): void => {
      messageErrorCallbacks.delete(callback);
    },
  },

  // ========== Session API ==========
  session: {
    /**
     * 获取所有会话列表
     */
    list: (): Promise<Session[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_LIST);
    },

    /**
     * 创建新会话
     */
    create: (params?: string | { name?: string; workspace?: string }): Promise<Session> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_CREATE, params);
    },

    /**
     * 删除会话
     */
    delete: (sessionId: string): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_DELETE, sessionId);
    },

    /**
     * 重命名会话
     */
    rename: (sessionId: string, name: string): Promise<Session | null> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_RENAME, { sessionId, name });
    },

    /**
     * 更新会话工作空间
     */
    updateWorkspace: (sessionId: string, workspace: string): Promise<{ success: boolean; session?: Session }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_UPDATE_WORKSPACE, { sessionId, workspace });
    },

    /**
     * 获取会话消息
     */
    getMessages: (sessionId: string): Promise<Message[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_MESSAGES, sessionId);
    },

    /**
     * 获取所有会话的加载状态
     */
    getLoadingStates: (): Promise<Record<string, boolean>> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_LOADING_STATES);
    },

    /**
     * 监听会话创建
     */
    onCreated: (callback: SessionCreatedCallback): void => {
      sessionCreatedCallbacks.add(callback);
    },

    /**
     * 取消监听会话创建
     */
    offCreated: (callback: SessionCreatedCallback): void => {
      sessionCreatedCallbacks.delete(callback);
    },

    /**
     * 监听会话删除
     */
    onDeleted: (callback: SessionDeletedCallback): void => {
      sessionDeletedCallbacks.add(callback);
    },

    /**
     * 取消监听会话删除
     */
    offDeleted: (callback: SessionDeletedCallback): void => {
      sessionDeletedCallbacks.delete(callback);
    },

    /**
     * 监听会话更新
     */
    onUpdated: (callback: SessionUpdatedCallback): void => {
      sessionUpdatedCallbacks.add(callback);
    },

    /**
     * 取消监听会话更新
     */
    offUpdated: (callback: SessionUpdatedCallback): void => {
      sessionUpdatedCallbacks.delete(callback);
    },
  },

  // ========== Settings API ==========
  settings: {
    /**
     * 获取设置
     */
    get: (): Promise<Settings> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET);
    },

    /**
     * 保存设置
     */
    set: (settings: Partial<Settings>): Promise<SettingsSetResult> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, settings);
    },

    /**
     * 监听设置变更
     */
    onChange: (callback: SettingsChangedCallback): void => {
      settingsChangedCallbacks.add(callback);
    },

    /**
     * 取消监听设置变更
     */
    offChange: (callback: SettingsChangedCallback): void => {
      settingsChangedCallbacks.delete(callback);
    },
  },

  // ========== Window API ==========
  window: {
    /**
     * 打开设置窗口
     */
    openSettings: (tab?: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_OPEN_SETTINGS, tab);
    },

    /**
     * 关闭设置窗口
     */
    closeSettings: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE_SETTINGS);
    },
  },

  // ========== Shell API ==========
  shell: {
    /**
     * 打开配置目录
     */
    openConfigDir: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_CONFIG_DIR);
    },

    /**
     * 在文件管理器中显示指定路径
     */
    openPath: (path: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_PATH, path);
    },

    /**
     * 在默认浏览器中打开外部链接
     */
    openExternal: (url: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, url);
    },
  },

  // ========== Dialog API ==========
  dialog: {
    /**
     * 选择文件夹
     */
    selectFolder: (): Promise<{ success: boolean; path: string | null }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FOLDER);
    },

    /**
     * 选择图片文件
     */
    selectImages: (): Promise<{ success: boolean; images: ImageAttachment[] }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_IMAGES);
    },

    /**
     * 显示确认对话框
     */
    confirm: (options: { title: string; message: string; detail?: string }): Promise<{ confirmed: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.DIALOG_CONFIRM, options);
    },
  },

  // ========== Shortcuts API ==========
  shortcuts: {
    /**
     * 监听新会话快捷键
     */
    onNewSession: (callback: () => void): void => {
      newSessionShortcutCallbacks.add(callback);
    },

    /**
     * 取消监听新会话快捷键
     */
    offNewSession: (callback: () => void): void => {
      newSessionShortcutCallbacks.delete(callback);
    },
  },

  // ========== CLI API ==========
  cli: {
    /**
     * 监听 CLI 创建会话事件
     */
    onSessionCreated: (callback: (data: { sessionId: string }) => void): void => {
      cliSessionCreatedCallbacks.add(callback);
    },

    /**
     * 取消监听 CLI 创建会话事件
     */
    offSessionCreated: (callback: (data: { sessionId: string }) => void): void => {
      cliSessionCreatedCallbacks.delete(callback);
    },
  },

  // ========== Skills API ==========
  skills: {
    /**
     * 加载所有 skills
     */
    load: (): Promise<SkillsLoadResult> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILLS_LOAD);
    },

    /**
     * 列出推荐的 skills
     */
    listRecommended: (): Promise<RecommendedSkill[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILLS_LIST_RECOMMENDED);
    },

    /**
     * 安装 skill
     */
    install: (skillId: string, target: SkillInstallTarget, workspacePath?: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILLS_INSTALL, { skillId, target, workspacePath });
    },

    /**
     * 卸载 skill
     */
    uninstall: (skillPath: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILLS_UNINSTALL, skillPath);
    },
  },

  // ========== Workspace API ==========
  workspace: {
    /**
     * 列出工作空间文件
     */
    listFiles: (sessionId: string, query?: string, limit?: number): Promise<{ success: boolean; files: FileInfo[] }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_LIST_FILES, { sessionId, query, limit });
    },

    /**
     * 验证路径是否存在
     */
    validatePaths: (sessionId: string, paths: string[]): Promise<{ success: boolean; validPaths: string[] }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_VALIDATE_PATHS, { sessionId, paths });
    },
  },

  // ========== App API ==========
  app: {
    /**
     * 获取应用版本号
     */
    getVersion: (): Promise<{ success: boolean; version: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION);
    },
  },
};

// 暴露 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript 类型声明
export type ElectronAPI = typeof electronAPI;
