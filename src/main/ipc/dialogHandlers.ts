import { ipcMain, dialog } from 'electron';
import path from 'path';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { ImageAttachment, ImageMimeType } from '../../shared/types';
import mainI18n from '../i18n';
import { createLogger } from '../store/logger';

const log = createLogger('IpcHandlers:Dialog');

export function registerDialogHandlers(): void {
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
}
