import { ipcMain, BrowserWindow, shell, dialog } from 'electron';
import os from 'os';
import { IPC_CHANNELS } from '../../shared/ipc';
import { Settings, Message, PermissionResult, ToolPermissionRequest, AskUserQuestionRequest, Session, SkillsLoadResult, RecommendedSkill, SkillInstallTarget, QueryOptions } from '../../shared/types';
import { executeQuery, interruptQuery } from '../agent/agentService';
import { sessionStore } from '../store/sessionStore';
import { permissionManager } from '../agent/permissionManager';
import * as configStore from '../store/configStore';
import * as skillsStore from '../store/skillsStore';
import { openSettingsWindow, closeSettingsWindow, registerShortcuts } from '../index';

// 设置保存结果类型
interface SettingsSetResult {
  success: boolean;
  data?: Settings;
  errors?: { field: string; message: string }[];
}

/**
 * 注册所有 IPC 处理器
 */
export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // ========== Agent 相关 ==========

  // 执行查询
  ipcMain.handle(
    IPC_CHANNELS.AGENT_QUERY,
    async (_event, params: { prompt: string; sessionId: string; options?: QueryOptions }) => {
      try {
        // 获取 SDK session ID
        const sdkSessionId = sessionStore.getSdkSessionId(params.sessionId);
        await executeQuery({
          prompt: params.prompt,
          sessionId: params.sessionId,
          sdkSessionId,
          options: params.options,
        });
        return { success: true };
      } catch (error) {
        console.log("===AGENT_QUERY_ERROR", error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
      }
    }
  );

  // 中断查询
  ipcMain.handle(IPC_CHANNELS.AGENT_INTERRUPT, async (_event, sessionId: string) => {
    try {
      await interruptQuery(sessionId);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // ========== 权限相关 ==========

  // 响应权限请求
  ipcMain.handle(
    IPC_CHANNELS.PERMISSION_RESPOND,
    async (_event, params: { requestId: string; result: PermissionResult }) => {
      // 获取待处理的请求信息（在响应前获取）
      const pendingRequest = permissionManager.getPendingRequestById(params.requestId);

      // 响应权限请求
      const success = permissionManager.respondToRequest(params.requestId, params.result);

      // 如果成功且有请求信息，将权限记录添加到当前活跃的 assistant 消息中
      if (success && pendingRequest) {
        sessionStore.addContentBlockToActiveMessage(pendingRequest.sessionId, {
          type: 'permission',
          permission: {
            toolName: pendingRequest.toolName,
            input: pendingRequest.input,
            result: params.result.behavior,
            timestamp: new Date().toISOString(),
          },
        });
      }

      return { success };
    }
  );

  // ========== AskUserQuestion 相关 ==========

  // 响应用户问题请求
  ipcMain.handle(
    IPC_CHANNELS.ASK_USER_QUESTION_RESPOND,
    async (_event, params: { requestId: string; answers: Record<string, string> }) => {
      // 获取待处理的请求信息（在响应前获取）
      const pendingRequest = permissionManager.getPendingQuestionById(params.requestId);

      // 响应问题请求
      const success = permissionManager.respondToQuestion(params.requestId, params.answers);

      // 如果成功且有请求信息，将用户问题记录添加到当前活跃的 assistant 消息中
      if (success && pendingRequest) {
        sessionStore.addContentBlockToActiveMessage(pendingRequest.sessionId, {
          type: 'user_question',
          userQuestion: {
            questions: pendingRequest.questions,
            answers: params.answers,
            timestamp: new Date().toISOString(),
          },
        });
      }

      return { success };
    }
  );

  // ========== 会话相关 ==========

  // 列出所有会话
  ipcMain.handle(IPC_CHANNELS.SESSION_LIST, async () => {
    const sessions = await sessionStore.loadAllSessions();
    // 返回不含消息的列表（减少传输数据）
    return sessions.map(s => ({ ...s, messages: [] }));
  });

  // 创建会话
  ipcMain.handle(
    IPC_CHANNELS.SESSION_CREATE,
    async (_event, params?: string | { name?: string; workspace?: string }) => {
      // 支持旧格式（字符串）和新格式（对象）
      if (typeof params === 'string') {
        return await sessionStore.createSession(params);
      }
      return await sessionStore.createSession(params?.name, params?.workspace);
    }
  );

  // 删除会话
  ipcMain.handle(IPC_CHANNELS.SESSION_DELETE, async (_event, sessionId: string) => {
    return await sessionStore.deleteSession(sessionId);
  });

  // 重命名会话
  ipcMain.handle(
    IPC_CHANNELS.SESSION_RENAME,
    async (_event, params: { sessionId: string; name: string }) => {
      return await sessionStore.renameSession(params.sessionId, params.name);
    }
  );

  // 更新会话工作空间
  ipcMain.handle(
    IPC_CHANNELS.SESSION_UPDATE_WORKSPACE,
    async (_event, params: { sessionId: string; workspace: string }): Promise<{ success: boolean; session?: Session }> => {
      const session = await sessionStore.updateSessionWorkspace(params.sessionId, params.workspace);
      return { success: !!session, session: session || undefined };
    }
  );

  // 获取会话消息
  ipcMain.handle(IPC_CHANNELS.SESSION_GET_MESSAGES, async (_event, sessionId: string): Promise<Message[]> => {
    // 确保会话已加载到内存
    await sessionStore.ensureSessionLoaded(sessionId);
    return sessionStore.getMessages(sessionId);
  });

  // 获取所有会话的加载状态
  ipcMain.handle(IPC_CHANNELS.SESSION_GET_LOADING_STATES, async () => {
    return sessionStore.getAllLoadingStates();
  });

  // ========== 设置相关 ==========

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

  // ========== Skills 相关 ==========

  // 加载所有 skills
  ipcMain.handle(IPC_CHANNELS.SKILLS_LOAD, async (): Promise<SkillsLoadResult> => {
    return await skillsStore.loadAllSkills();
  });

  // 列出推荐的 skills
  ipcMain.handle(IPC_CHANNELS.SKILLS_LIST_RECOMMENDED, async (): Promise<RecommendedSkill[]> => {
    return await skillsStore.listRecommendedSkills();
  });

  // 安装 skill
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_INSTALL,
    async (_event, params: { skillId: string; target: SkillInstallTarget; workspacePath?: string }): Promise<{ success: boolean; error?: string }> => {
      try {
        await skillsStore.installSkill(params.skillId, params.target, params.workspacePath);
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
      }
    }
  );

  // 卸载 skill
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_UNINSTALL,
    async (_event, skillPath: string): Promise<{ success: boolean; error?: string }> => {
      try {
        await skillsStore.uninstallSkill(skillPath);
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
      }
    }
  );

  // ========== 窗口相关 ==========

  // 打开设置窗口
  ipcMain.handle(IPC_CHANNELS.WINDOW_OPEN_SETTINGS, () => {
    openSettingsWindow();
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

  // ========== 对话框相关 ==========

  // 选择文件夹
  ipcMain.handle(
    IPC_CHANNELS.DIALOG_SELECT_FOLDER,
    async (): Promise<{ success: boolean; path: string | null }> => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: '选择工作空间目录',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, path: null };
      }

      return { success: true, path: result.filePaths[0] };
    }
  );

  // 确认对话框
  ipcMain.handle(
    IPC_CHANNELS.DIALOG_CONFIRM,
    async (_event, options: { title: string; message: string; detail?: string }): Promise<{ confirmed: boolean }> => {
      const result = await dialog.showMessageBox({
        type: 'question',
        buttons: ['取消', '确认'],
        defaultId: 0,
        cancelId: 0,
        title: options.title,
        message: options.message,
        detail: options.detail,
      });

      return { confirmed: result.response === 1 };
    }
  );

  // ========== 设置 SessionStore 事件监听 ==========
  setupSessionStoreListeners(mainWindow);

  // ========== 设置 PermissionManager 事件监听 ==========
  setupPermissionManagerListeners(mainWindow);
}

/**
 * 设置 SessionStore 事件监听，推送到渲染进程
 */
function setupSessionStoreListeners(mainWindow: BrowserWindow): void {
  // 消息更新
  sessionStore.on('messages:updated', (sessionId: string, messages: Message[]) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PUSH_MESSAGES_UPDATED, { sessionId, messages });
    }
  });

  // 查询状态变化
  sessionStore.on('query:state', (sessionId: string, state: { isLoading: boolean }) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PUSH_QUERY_STATE, { sessionId, isLoading: state.isLoading });
    }
  });

  // 查询完成
  sessionStore.on('query:complete', (sessionId: string, data: unknown) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PUSH_QUERY_COMPLETE, { sessionId, ...data as object });
    }
  });

  // 查询错误
  sessionStore.on('query:error', (sessionId: string, error: string) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PUSH_QUERY_ERROR, { sessionId, error });
    }
  });

  // 会话创建
  sessionStore.on('session:created', (session: unknown) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PUSH_SESSION_CREATED, session);
    }
  });

  // 会话删除
  sessionStore.on('session:deleted', (sessionId: string) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PUSH_SESSION_DELETED, { sessionId });
    }
  });

  // 会话更新
  sessionStore.on('session:updated', (session: unknown) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PUSH_SESSION_UPDATED, session);
    }
  });

  // SDK Session ID 更新
  sessionStore.on('session:sdkSessionId', (sessionId: string, sdkSessionId: string) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PUSH_SDK_SESSION_ID, { sessionId, sdkSessionId });
    }
  });
}

/**
 * 设置 PermissionManager 事件监听，推送到渲染进程
 */
function setupPermissionManagerListeners(mainWindow: BrowserWindow): void {
  // 权限请求
  permissionManager.on('permission:request', (request: ToolPermissionRequest) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PUSH_PERMISSION_REQUEST, request);
    }
  });

  // 用户问题请求
  permissionManager.on('askUserQuestion:request', (request: AskUserQuestionRequest) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PUSH_ASK_USER_QUESTION_REQUEST, request);
    }
  });
}

/**
 * 移除所有 IPC 处理器
 */
export function removeIpcHandlers(): void {
  Object.values(IPC_CHANNELS).forEach(channel => {
    // 只移除 handle 类型的通道（不以 push: 开头的）
    if (!channel.startsWith('push:')) {
      ipcMain.removeHandler(channel);
    }
  });
}
