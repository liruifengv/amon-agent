import { z } from 'zod';
import { DEFAULT_SYSTEM_PROMPT } from './constants';

// ==================== 快捷键 Schema ====================

export const ShortcutsSchema = z.object({
  newSession: z.string().default('CmdOrCtrl+N'),
  openSettings: z.string().default('CmdOrCtrl+,'),
});

export type Shortcuts = z.infer<typeof ShortcutsSchema>;

export const DEFAULT_SHORTCUTS: Shortcuts = {
  newSession: 'CmdOrCtrl+N',
  openSettings: 'CmdOrCtrl+,',
};

// ==================== 工作空间 Schema ====================

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1, '工作空间名称不能为空'),
  path: z.string().min(1, '工作空间路径不能为空'),
  isDefault: z.boolean().default(false),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

// ==================== Provider 配置 Schema ====================

export const ProviderConfigSchema = z.object({
  /** pi-ai 的 provider 标识，如 "anthropic", "openai", "google" 等 */
  provider: z.string(),
  /** 该 provider 的 API Key */
  apiKey: z.string().default(''),
  /** 自定义 base URL（可选，用于代理或私有部署） */
  baseUrl: z.string().optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

// ==================== Agent 配置 Schema ====================

export const AgentSchema = z.object({
  /** Provider 配置列表（API Key 等） */
  providerConfigs: z.array(ProviderConfigSchema).default([]),

  /** 当前选中的 provider（如 "anthropic"） */
  activeProvider: z.string().default('anthropic'),

  /** 当前选中的 model ID（如 "claude-sonnet-4-20250514"） */
  activeModelId: z.string().default('claude-sonnet-4-20250514'),

  /** thinking level */
  thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high']).default('medium'),

  /** 系统提示词（追加到默认提示词后） */
  systemPrompt: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().default(DEFAULT_SYSTEM_PROMPT)
  ),

  /** 最大轮数 */
  maxTurns: z.number().default(50),
});

export type AgentSettings = z.infer<typeof AgentSchema>;

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  providerConfigs: [],
  activeProvider: 'anthropic',
  activeModelId: 'claude-sonnet-4-20250514',
  thinkingLevel: 'medium',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  maxTurns: 50,
};

// ==================== 设置 Schema ====================

export const SettingsSchema = z.object({
  // 主题
  theme: z.enum(['light', 'dark', 'system']).default('system'),

  // 语言
  language: z.enum(['en', 'zh']).default('en'),

  // 快捷键配置
  shortcuts: ShortcutsSchema.default(DEFAULT_SHORTCUTS),

  // 保存的工作空间列表
  workspaces: z.array(WorkspaceSchema).default([]),

  // Agent 配置
  agent: AgentSchema.default(DEFAULT_AGENT_SETTINGS),
});

// ==================== 类型导出 ====================

export type Settings = z.infer<typeof SettingsSchema>;

// 默认设置
export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  language: 'en',
  shortcuts: DEFAULT_SHORTCUTS,
  workspaces: [],
  agent: DEFAULT_AGENT_SETTINGS,
};

// ==================== 校验函数 ====================

/**
 * 校验并解析设置，返回校验后的设置对象
 * 如果校验失败，使用默认值填充
 */
export function parseSettings(data: unknown): Settings {
  const result = SettingsSchema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  // 校验失败时，尝试部分解析并合并默认值
  console.warn('Settings validation failed:', result.error.flatten());

  // 如果是对象，尝试逐个字段校验
  if (data && typeof data === 'object') {
    const partialData = data as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };

    // 逐个字段尝试校验
    for (const key of Object.keys(SettingsSchema.shape)) {
      if (key in partialData) {
        const fieldSchema = SettingsSchema.shape[key as keyof typeof SettingsSchema.shape];
        const fieldResult = fieldSchema.safeParse(partialData[key]);
        if (fieldResult.success) {
          merged[key] = fieldResult.data;
        }
      }
    }

    return merged as Settings;
  }

  return DEFAULT_SETTINGS;
}

/**
 * 校验设置更新，返回校验结果
 */
export function validateSettingsUpdate(
  updates: Partial<Settings>
): { success: true; data: Partial<Settings> } | { success: false; errors: { field: string; message: string }[] } {
  const partialSchema = SettingsSchema.partial();
  const result = partialSchema.safeParse(updates);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map((err) => ({
    field: err.path.map(String).join('.'),
    message: err.message,
  }));

  return { success: false, errors };
}
