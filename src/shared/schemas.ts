import { z } from 'zod';
import { DEFAULT_MAX_THINKING_TOKENS, DEFAULT_SYSTEM_PROMPT } from './constants';

// ==================== 权限模式 Schema ====================

export const PermissionModeSchema = z.enum(['default', 'acceptEdits', 'dontAsk', 'bypassPermissions']);

export type PermissionMode = z.infer<typeof PermissionModeSchema>;

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

// ==================== Provider Schema ====================

export const ProviderSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Provider 名称不能为空'),
  apiUrl: z.string().min(1, 'API URL 不能为空'),
  apiKey: z.string().min(1, 'API Key 不能为空'),
  model: z.string().min(1, '模型名称不能为空'),
});

export type Provider = z.infer<typeof ProviderSchema>;

// ==================== Agent 配置 Schema ====================

export const AgentSchema = z.object({
  // Provider 列表
  providers: z.array(ProviderSchema).default([]),

  // 当前选中的 Provider ID
  activeProviderId: z.string().nullable().default(null),

  // 系统提示词（追加到 SDK 预设提示词后）
  // 空字符串视为未设置，使用默认提示词
  systemPrompt: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().default(DEFAULT_SYSTEM_PROMPT)
  ),

  // 权限模式
  permissionMode: PermissionModeSchema.default('default'),

  // 最大轮数（不暴露 UI）
  maxTurns: z.number().default(50),

  // 最大思考 token 数（不暴露 UI）
  maxThinkingTokens: z.number().default(DEFAULT_MAX_THINKING_TOKENS),

  // 可用的工具（不暴露 UI）
  tools: z.array(z.string()).optional(),

  // 允许的工具（不暴露 UI）
  allowedTools: z.array(z.string()).optional(),

  // Claude Code 模式：开启后继承 Claude Code 配置
  claudeCodeMode: z.boolean().default(false),
});

export type AgentSettings = z.infer<typeof AgentSchema>;

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  providers: [],
  activeProviderId: null,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  permissionMode: 'default',
  maxTurns: 100,
  maxThinkingTokens: DEFAULT_MAX_THINKING_TOKENS,
  claudeCodeMode: false,
};

// ==================== 设置 Schema ====================

export const SettingsSchema = z.object({
  // 主题
  theme: z.enum(['light', 'dark', 'system']).default('system'),

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
