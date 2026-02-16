import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { Message, Session } from '../../shared/types';
import { deleteSessionAgent } from '../agent/agentService';
import { sessionStore } from '../store/sessionStore';

export function registerSessionHandlers(): void {
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
    deleteSessionAgent(sessionId);
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
}
