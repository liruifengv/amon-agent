import { z } from 'zod';

// ==================== Provider 配置 Schema ====================

export const ProviderConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  apiKey: z.string().default(''),
  baseUrl: z.string().optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

// ==================== Agent 配置 Schema ====================

export const AgentSettingsSchema = z.object({
  activeProviderId: z.string().default('anthropic'),
  activeModelId: z.string().default('claude-sonnet-4-20250514'),
  maxTurns: z.number().default(50),
  thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high']).default('medium'),
  providerConfigs: z.array(ProviderConfigSchema).default([]),
});

export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

export const DEFAULT_AGENT_SETTINGS: AgentSettings = AgentSettingsSchema.parse({});

// ==================== 工作空间 Schema ====================

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  path: z.string().min(1),
  isDefault: z.boolean().default(false),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

// ==================== 快捷键 Schema ====================

export const ShortcutsSchema = z.object({
  newSession: z.string().default('CmdOrCtrl+N'),
  openSettings: z.string().default('CmdOrCtrl+,'),
});

export type Shortcuts = z.infer<typeof ShortcutsSchema>;

export const DEFAULT_SHORTCUTS: Shortcuts = ShortcutsSchema.parse({});

// ==================== 设置 Schema ====================

export const SettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  language: z.enum(['en', 'zh']).default('en'),
  shortcuts: ShortcutsSchema.default(DEFAULT_SHORTCUTS),
  workspaces: z.array(WorkspaceSchema).default([]),
  agent: AgentSettingsSchema.default(DEFAULT_AGENT_SETTINGS),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

// ==================== 设置迁移 ====================

/**
 * Migrate old settings format to new format.
 * Old format: top-level `providers[]`, `agent.provider`, `agent.model`, `agent.thinkingBudget`
 * New format: `agent.providerConfigs[]`, `agent.activeProviderId`, `agent.activeModelId`, `agent.thinkingLevel`
 */
function migrateSettings(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const raw = { ...(data as Record<string, unknown>) };

  // Deep-clone agent to avoid mutating input
  if (raw.agent && typeof raw.agent === 'object') {
    raw.agent = { ...(raw.agent as Record<string, unknown>) };
  }

  const agent = (raw.agent || {}) as Record<string, unknown>;

  // Migrate old top-level `providers[]` → `agent.providerConfigs[]`
  if (Array.isArray(raw.providers) && !agent.providerConfigs) {
    agent.providerConfigs = (raw.providers as Record<string, unknown>[]).map(p => ({
      id: ((p.id as string) || '').toLowerCase(),
      name: (p.id as string) || (p.name as string) || '',
      apiKey: (p.apiKey as string) || '',
      ...(p.baseUrl ? { baseUrl: p.baseUrl as string } : {}),
    }));
    delete raw.providers;
  }

  // Migrate `agent.provider` → `agent.activeProviderId`
  if (agent.provider && !agent.activeProviderId) {
    agent.activeProviderId = (agent.provider as string).toLowerCase();
  }
  delete agent.provider;

  // Migrate `agent.model` → `agent.activeModelId`
  if (agent.model && !agent.activeModelId) {
    agent.activeModelId = agent.model;
  }
  delete agent.model;

  // Remove old agent fields that don't exist in new schema
  delete agent.thinkingBudget;
  delete agent.customSystemPrompt;

  raw.agent = agent;

  // Migrate workspaces: add `id` if missing
  if (Array.isArray(raw.workspaces)) {
    raw.workspaces = (raw.workspaces as Record<string, unknown>[]).map((w, i) => ({
      ...w,
      id: w.id || `ws_${i}`,
      isDefault: w.isDefault ?? false,
    }));
  }

  // Remove old top-level fields
  delete raw.defaultWorkspace;

  return raw;
}

// ==================== 校验函数 ====================

export function parseSettings(data: unknown): Settings {
  // First try to migrate old format
  const migrated = migrateSettings(data);

  const result = SettingsSchema.safeParse(migrated);
  if (result.success) return result.data;

  console.warn('Settings validation failed, using defaults', result.error.issues);
  return DEFAULT_SETTINGS;
}
