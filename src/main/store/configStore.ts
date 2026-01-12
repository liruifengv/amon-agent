import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  Settings,
  DEFAULT_SETTINGS,
  parseSettings,
  validateSettingsUpdate,
} from '../../shared/schemas';

// 校验错误类型
export interface SettingsValidationError {
  field: string;
  message: string;
}

export class SettingsValidationFailedError extends Error {
  errors: SettingsValidationError[];

  constructor(errors: SettingsValidationError[]) {
    super('Settings validation failed');
    this.name = 'SettingsValidationFailedError';
    this.errors = errors;
  }
}

// 应用配置目录：~/.amon
const CONFIG_DIR = path.join(os.homedir(), '.amon');
const CONFIG_PATH = path.join(CONFIG_DIR, 'settings.json');

/**
 * 获取配置目录路径
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * 获取设置
 * 使用 zod 校验配置文件内容，无效字段使用默认值
 */
export async function getSettings(): Promise<Settings> {
  try {
    const content = await fs.readFile(CONFIG_PATH, 'utf-8');
    const rawData = JSON.parse(content);
    return parseSettings(rawData);
  } catch (error) {
    // 文件不存在或 JSON 解析失败，返回默认设置
    if (error instanceof SyntaxError) {
      console.error('Settings file contains invalid JSON:', error.message);
    }
    return DEFAULT_SETTINGS;
  }
}

/**
 * 保存设置
 * 校验更新内容，如果校验失败则抛出错误
 */
export async function setSettings(updates: Partial<Settings>): Promise<Settings> {
  // 校验更新内容
  const validation = validateSettingsUpdate(updates);

  if (!validation.success) {
    // 抛出校验错误，不保存
    throw new SettingsValidationFailedError(validation.errors);
  }

  updates = validation.data;

  const currentSettings = await getSettings();
  const newSettings = { ...currentSettings, ...updates };

  // 确保目录存在
  const dir = path.dirname(CONFIG_PATH);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }

  await fs.writeFile(CONFIG_PATH, JSON.stringify(newSettings, null, 2));

  return newSettings;
}

// 导出供其他模块使用
export { DEFAULT_SETTINGS };
export type { Settings };
