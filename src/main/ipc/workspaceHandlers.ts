import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { FileInfo } from '../../shared/types';
import { sessionStore } from '../store/sessionStore';
import * as workspaceService from '../services/workspaceService';
import { createLogger } from '../store/logger';

const log = createLogger('IpcHandlers:Workspace');

export function registerWorkspaceHandlers(): void {
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
}
