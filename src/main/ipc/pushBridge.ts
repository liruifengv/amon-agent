import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { Message } from '../../shared/types';
import { sessionStore } from '../store/sessionStore';

/**
 * 设置 SessionStore 事件监听，推送到渲染进程
 */
export function setupSessionStoreListeners(mainWindow: BrowserWindow): void {
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
}
