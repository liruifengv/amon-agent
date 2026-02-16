import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { ImageAttachment } from '../../shared/types';
import { sendMessage, interruptMessage } from '../agent/agentService';
import { modelManager } from '../agent/modelManager';
import { createLogger } from '../store/logger';

const log = createLogger('IpcHandlers:Agent');

export function registerAgentHandlers(): void {
  // 发送消息
  ipcMain.handle(
    IPC_CHANNELS.AGENT_SEND_MESSAGE,
    async (_event, params: { prompt: string; sessionId: string; images?: ImageAttachment[] }) => {
      try {
        log.info('IPC: Agent sendMessage received', { promptLength: params.prompt.length, imageCount: params.images?.length ?? 0 }, params.sessionId);
        await sendMessage({
          prompt: params.prompt,
          sessionId: params.sessionId,
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

  // 获取可用 Provider 列表
  ipcMain.handle(IPC_CHANNELS.AGENT_GET_PROVIDERS, async () => {
    try {
      const providerIds = modelManager.getAvailableProviders();
      const providers = providerIds.map(id => ({ id, name: id }));
      return { success: true, providers };
    } catch (error) {
      log.error('IPC: Failed to get providers', error instanceof Error ? { message: error.message } : error);
      return { success: false, providers: [] };
    }
  });

  // 获取指定 Provider 的模型列表
  ipcMain.handle(IPC_CHANNELS.AGENT_GET_MODELS, async (_event, provider: string) => {
    try {
      const rawModels = modelManager.getAvailableModels(provider);
      const models = rawModels.map(m => ({ id: m.id, name: m.name, reasoning: m.reasoning }));
      return { success: true, models };
    } catch (error) {
      log.error('IPC: Failed to get models', error instanceof Error ? { message: error.message } : error);
      return { success: false, models: [] };
    }
  });
}
