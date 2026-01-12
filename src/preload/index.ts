import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc';
import { Settings, Session, Message, ToolPermissionRequest, PermissionResult, AskUserQuestionRequest, SkillsLoadResult, RecommendedSkill, SkillInstallTarget, QueryOptions } from '../shared/types';

// 推送事件回调类型
type MessagesUpdatedCallback = (data: { sessionId: string; messages: Message[] }) => void;
type QueryStateCallback = (data: { sessionId: string; isLoading: boolean }) => void;
type QueryCompleteCallback = (data: {
  sessionId: string;
  success: boolean;
  result?: string;
  cost?: number;
  duration?: number;
  usage?: { input_tokens: number; output_tokens: number };
  errors?: string[];
}) => void;
type QueryErrorCallback = (data: { sessionId: string; error: string }) => void;
type SessionCreatedCallback = (session: Session) => void;
type SessionDeletedCallback = (data: { sessionId: string }) => void;
type SessionUpdatedCallback = (session: Session) => void;
type SdkSessionIdCallback = (data: { sessionId: string; sdkSessionId: string }) => void;
type SettingsChangedCallback = (settings: Settings) => void;
type PermissionRequestCallback = (request: ToolPermissionRequest) => void;
type AskUserQuestionRequestCallback = (request: AskUserQuestionRequest) => void;

// 回调列表
const messagesUpdatedCallbacks: Set<MessagesUpdatedCallback> = new Set();
const queryStateCallbacks: Set<QueryStateCallback> = new Set();
const queryCompleteCallbacks: Set<QueryCompleteCallback> = new Set();
const queryErrorCallbacks: Set<QueryErrorCallback> = new Set();
const sessionCreatedCallbacks: Set<SessionCreatedCallback> = new Set();
const sessionDeletedCallbacks: Set<SessionDeletedCallback> = new Set();
const sessionUpdatedCallbacks: Set<SessionUpdatedCallback> = new Set();
const sdkSessionIdCallbacks: Set<SdkSessionIdCallback> = new Set();
const settingsChangedCallbacks: Set<SettingsChangedCallback> = new Set();
const newSessionShortcutCallbacks: Set<() => void> = new Set();
const permissionRequestCallbacks: Set<PermissionRequestCallback> = new Set();
const askUserQuestionRequestCallbacks: Set<AskUserQuestionRequestCallback> = new Set();
const cliSessionCreatedCallbacks: Set<(data: { sessionId: string }) => void> = new Set();

// 监听主进程推送事件
ipcRenderer.on(IPC_CHANNELS.PUSH_MESSAGES_UPDATED, (_event, data) => {
  messagesUpdatedCallbacks.forEach(cb => cb(data));
});

ipcRenderer.on(IPC_CHANNELS.PUSH_QUERY_STATE, (_event, data) => {
  queryStateCallbacks.forEach(cb => cb(data));
});

ipcRenderer.on(IPC_CHANNELS.PUSH_QUERY_COMPLETE, (_event, data) => {
  queryCompleteCallbacks.forEach(cb => cb(data));
});

ipcRenderer.on(IPC_CHANNELS.PUSH_QUERY_ERROR, (_event, data) => {
  queryErrorCallbacks.forEach(cb => cb(data));
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

ipcRenderer.on(IPC_CHANNELS.PUSH_SDK_SESSION_ID, (_event, data) => {
  sdkSessionIdCallbacks.forEach(cb => cb(data));
});

ipcRenderer.on(IPC_CHANNELS.SETTINGS_CHANGED, (_event, settings) => {
  settingsChangedCallbacks.forEach(cb => cb(settings));
});

ipcRenderer.on(IPC_CHANNELS.SHORTCUT_NEW_SESSION, () => {
  newSessionShortcutCallbacks.forEach(cb => cb());
});

ipcRenderer.on(IPC_CHANNELS.PUSH_PERMISSION_REQUEST, (_event, request) => {
  permissionRequestCallbacks.forEach(cb => cb(request));
});

ipcRenderer.on(IPC_CHANNELS.PUSH_ASK_USER_QUESTION_REQUEST, (_event, request) => {
  askUserQuestionRequestCallbacks.forEach(cb => cb(request));
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
     * 发送查询请求
     */
    query: (
      prompt: string,
      sessionId: string,
      options?: QueryOptions
    ): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.AGENT_QUERY, { prompt, sessionId, options });
    },

    /**
     * 中断指定会话的查询
     */
    interrupt: (sessionId: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.AGENT_INTERRUPT, sessionId);
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
     * 监听查询状态变化
     */
    onQueryState: (callback: QueryStateCallback): void => {
      queryStateCallbacks.add(callback);
    },

    /**
     * 取消监听查询状态变化
     */
    offQueryState: (callback: QueryStateCallback): void => {
      queryStateCallbacks.delete(callback);
    },

    /**
     * 监听查询完成
     */
    onQueryComplete: (callback: QueryCompleteCallback): void => {
      queryCompleteCallbacks.add(callback);
    },

    /**
     * 取消监听查询完成
     */
    offQueryComplete: (callback: QueryCompleteCallback): void => {
      queryCompleteCallbacks.delete(callback);
    },

    /**
     * 监听查询错误
     */
    onQueryError: (callback: QueryErrorCallback): void => {
      queryErrorCallbacks.add(callback);
    },

    /**
     * 取消监听查询错误
     */
    offQueryError: (callback: QueryErrorCallback): void => {
      queryErrorCallbacks.delete(callback);
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

    /**
     * 监听 SDK session ID 更新
     */
    onSdkSessionId: (callback: SdkSessionIdCallback): void => {
      sdkSessionIdCallbacks.add(callback);
    },

    /**
     * 取消监听 SDK session ID 更新
     */
    offSdkSessionId: (callback: SdkSessionIdCallback): void => {
      sdkSessionIdCallbacks.delete(callback);
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
    set: (settings: Partial<Settings>): Promise<Settings> => {
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
    openSettings: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_OPEN_SETTINGS);
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

  // ========== Permission API ==========
  permission: {
    /**
     * 响应权限请求
     */
    respond: (requestId: string, result: PermissionResult): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_RESPOND, { requestId, result });
    },

    /**
     * 监听权限请求
     */
    onRequest: (callback: PermissionRequestCallback): void => {
      permissionRequestCallbacks.add(callback);
    },

    /**
     * 取消监听权限请求
     */
    offRequest: (callback: PermissionRequestCallback): void => {
      permissionRequestCallbacks.delete(callback);
    },
  },

  // ========== AskUserQuestion API ==========
  askUserQuestion: {
    /**
     * 响应用户问题请求
     */
    respond: (requestId: string, answers: Record<string, string>): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.ASK_USER_QUESTION_RESPOND, { requestId, answers });
    },

    /**
     * 监听用户问题请求
     */
    onRequest: (callback: AskUserQuestionRequestCallback): void => {
      askUserQuestionRequestCallbacks.add(callback);
    },

    /**
     * 取消监听用户问题请求
     */
    offRequest: (callback: AskUserQuestionRequestCallback): void => {
      askUserQuestionRequestCallbacks.delete(callback);
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
};

// 暴露 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript 类型声明
export type ElectronAPI = typeof electronAPI;
