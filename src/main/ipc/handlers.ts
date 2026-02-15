import { ipcMain, BrowserWindow, shell, dialog, app } from 'electron';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { IPC_CHANNELS } from '../../shared/ipc';
import { Settings, Message, PermissionResult, ToolPermissionRequest, AskUserQuestionRequest, PlanApprovalRequest, PlanApprovalResponse, Session, SkillsLoadResult, RecommendedSkill, SkillInstallTarget, MessageOptions, SettingsSetResult, ImageAttachment, ImageMimeType, FileInfo } from '../../shared/types';
import { sendMessage, interruptMessage } from '../agent/agentService';
import { sessionStore } from '../store/sessionStore';
import { permissionManager } from '../agent/permissionManager';
import * as configStore from '../store/configStore';
import * as skillsStore from '../store/skillsStore';
import * as workspaceService from '../services/workspaceService';
import { openSettingsWindow, closeSettingsWindow, registerShortcuts } from '../index';
import { createLogger } from '../store/logger';
import mainI18n from '../i18n';

const log = createLogger('IpcHandlers');

/**
 * 注册所有 IPC 处理器
 */
export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // ========== Agent 相关 ==========

  // 发送消息
  ipcMain.handle(
    IPC_CHANNELS.AGENT_SEND_MESSAGE,
    async (_event, params: { prompt: string; sessionId: string; options?: MessageOptions; images?: ImageAttachment[] }) => {
      try {
        log.info('IPC: Agent sendMessage received', { promptLength: params.prompt.length, imageCount: params.images?.length ?? 0 }, params.sessionId);
        // 获取 SDK session ID
        const sdkSessionId = sessionStore.getSdkSessionId(params.sessionId);
        await sendMessage({
          prompt: params.prompt,
          sessionId: params.sessionId,
          sdkSessionId,
          options: params.options,
          images: params.images,
        });
        return { success: true };
      } catch (error) {
        log.error('IPC: Agent sendMessage failed', error instanceof Error ? { message: error.message } : error, params.sessionId);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
      }
    }
  );

  // 中断消息处理
  ipcMain.handle(IPC_CHANNELS.AGENT_INTERRUPT, async (_event, sessionId: string) => {
    try {
      log.info('IPC: Agent interrupt requested', undefined, sessionId);
      await interruptMessage(sessionId);
      return { success: true };
    } catch (error) {
      log.error('IPC: Agent interrupt failed', error instanceof Error ? { message: error.message } : error, sessionId);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // ========== 权限相关 ==========

  // 响应权限请求
  ipcMain.handle(
    IPC_CHANNELS.PERMISSION_RESPOND,
    async (_event, params: { requestId: string; result: PermissionResult }) => {
      log.debug('IPC: Permission response received', { requestId: params.requestId, behavior: params.result.behavior });

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

  // ========== 计划审批相关 ==========

  // 响应计划审批请求
  ipcMain.handle(
    IPC_CHANNELS.PLAN_APPROVAL_RESPOND,
    async (_event, params: { requestId: string; response: PlanApprovalResponse }) => {
      // 获取待处理的请求信息（在响应前获取）
      const pendingRequest = permissionManager.getPendingPlanApprovalById(params.requestId);

      // 响应计划审批请求
      const success = permissionManager.respondToPlanApproval(params.requestId, params.response);

      // 如果成功且有请求信息，将计划审批记录添加到当前活跃的 assistant 消息中
      if (success && pendingRequest) {
        sessionStore.addContentBlockToActiveMessage(pendingRequest.sessionId, {
          type: 'plan_approval',
          planApproval: {
            id: pendingRequest.id,
            plan: pendingRequest.plan,
            approved: params.response.approved,
            message: params.response.message,
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

  // ========== Workspace 相关 ==========

  // 列出工作空间文件
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_LIST_FILES,
    async (_event, params: { sessionId: string; query?: string; limit?: number }): Promise<{ success: boolean; files: FileInfo[] }> => {
      try {
        const session = sessionStore.getSession(params.sessionId);
        if (!session?.workspace) {
          return { success: false, files: [] };
        }

        const files = await workspaceService.listFiles(
          session.workspace,
          params.query,
          params.limit
        );
        return { success: true, files };
      } catch (error) {
        log.error('IPC: Failed to list workspace files', error instanceof Error ? { message: error.message } : error);
        return { success: false, files: [] };
      }
    }
  );

  // 验证工作空间路径
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_VALIDATE_PATHS,
    async (_event, params: { sessionId: string; paths: string[] }): Promise<{ success: boolean; validPaths: string[] }> => {
      try {
        const session = sessionStore.getSession(params.sessionId);
        if (!session?.workspace) {
          return { success: false, validPaths: [] };
        }

        const validPaths = await workspaceService.validatePaths(
          session.workspace,
          params.paths
        );
        return { success: true, validPaths };
      } catch (error) {
        log.error('IPC: Failed to validate paths', error instanceof Error ? { message: error.message } : error);
        return { success: false, validPaths: [] };
      }
    }
  );

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

  // ========== 对话框相关 ==========

  // 选择文件夹
  ipcMain.handle(
    IPC_CHANNELS.DIALOG_SELECT_FOLDER,
    async (): Promise<{ success: boolean; path: string | null }> => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: mainI18n.t('selectWorkspaceDir'),
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
        buttons: [mainI18n.t('dialogCancel'), mainI18n.t('dialogConfirm')],
        defaultId: 0,
        cancelId: 0,
        title: options.title,
        message: options.message,
        detail: options.detail,
      });

      return { confirmed: result.response === 1 };
    }
  );

  // 选择图片文件
  ipcMain.handle(
    IPC_CHANNELS.DIALOG_SELECT_IMAGES,
    async (): Promise<{ success: boolean; images: ImageAttachment[] }> => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }
        ],
        title: mainI18n.t('selectImage'),
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, images: [] };
      }

      // 读取文件并转换为 base64
      const images: ImageAttachment[] = [];
      const maxSize = 5 * 1024 * 1024; // 5MB 限制

      for (const filePath of result.filePaths) {
        try {
          const buffer = await fs.readFile(filePath);

          // 检查文件大小
          if (buffer.length > maxSize) {
            log.warn('IPC: Image file too large, skipping', { filePath, size: buffer.length });
            continue;
          }

          const filename = path.basename(filePath);
          const ext = path.extname(filePath).toLowerCase().slice(1);
          const mimeType: ImageMimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}` as ImageMimeType;
          const base64Data = buffer.toString('base64');

          log.info('IPC: Image loaded', {
            filename,
            mimeType,
            size: buffer.length,
            base64Length: base64Data.length,
            base64Preview: base64Data.substring(0, 50),
          });

          images.push({
            id: uuidv4(),
            filename,
            mimeType,
            base64Data,
            size: buffer.length,
          });
        } catch (error) {
          log.error('IPC: Failed to read image file', error instanceof Error ? { message: error.message, filePath } : { filePath });
        }
      }

      log.info('IPC: Returning images', { count: images.length });
      return { success: true, images };
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

  // 消息状态变化
  sessionStore.on('message:state', (sessionId: string, state: { isLoading: boolean }) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PUSH_MESSAGE_STATE, { sessionId, isLoading: state.isLoading });
    }
  });

  // 消息完成
  sessionStore.on('message:complete', (sessionId: string, data: unknown) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PUSH_MESSAGE_COMPLETE, { sessionId, ...data as object });
    }
  });

  // 消息错误
  sessionStore.on('message:error', (sessionId: string, error: string) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PUSH_MESSAGE_ERROR, { sessionId, error });
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

  // 计划审批请求
  permissionManager.on('planApproval:request', (request: PlanApprovalRequest) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PUSH_PLAN_APPROVAL_REQUEST, request);
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
