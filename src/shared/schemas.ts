import { z } from 'zod';

// ==================== Provider 配置 Schema ====================

export const ProviderConfigSchema = z.object({
  id: z.string(),
  apiType: z.string().default('openai-completions'),  // Api: 'anthropic-messages' | 'openai-completions' | 'openai-responses' | 'google-generative-ai'
  provider: z.string().default(''),                     // Provider: 'anthropic' | 'openai' | 'google' | ...
  icon: z.string().default(''),
  name: z.string().min(1),
  apiKey: z.string().default(''),
  baseUrl: z.string().optional(),
  modelId: z.string().default(''),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

// ==================== Agent 配置 Schema ====================

export const AgentSettingsSchema = z.object({
  activeProviderId: z.string().default('anthropic'),
  activeModelId: z.string().default('claude-sonnet-4-20250514'),
  maxTurns: z.number().default(50),
  thinkingLevel: z.enum(['off', 'low', 'medium', 'high', 'xhigh']).default('medium'),
  providerConfigs: z.array(ProviderConfigSchema).default([]),
  exaApiKey: z.string().default(''),
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

// ==================== Skills 配置 Schema ====================

export const SkillsSettingsSchema = z.object({
  /** 额外的 skill 搜索目录名（如 ".claude"），每个条目同时扫描系统级和项目级 */
  extraDirs: z.array(z.string()).default(['.claude']),
  /** 已禁用的技能名称列表 */
  disabledSkills: z.array(z.string()).default([]),
  /** 是否已完成首次内置技能安装 */
  initialized: z.boolean().default(false),
});

export type SkillsSettings = z.infer<typeof SkillsSettingsSchema>;

// ==================== 设置 Schema ====================

export const SettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  language: z.enum(['en', 'zh']).default('en'),
  chatWidth: z.enum(['narrow', 'wide']).default('narrow'),
  shortcuts: ShortcutsSchema.default(DEFAULT_SHORTCUTS),
  workspaces: z.array(WorkspaceSchema).default([]),
  agent: AgentSettingsSchema.default(DEFAULT_AGENT_SETTINGS),
  skills: SkillsSettingsSchema.default({ extraDirs: ['.claude'], disabledSkills: [], initialized: false }),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

// ==================== 设置迁移 ====================

/** Provider type → apiType 映射 */
const TYPE_TO_API_TYPE: Record<string, string> = {
  anthropic: 'anthropic-messages',
  openai: 'openai-completions',
  'openai-responses': 'openai-responses',
  gemini: 'google-generative-ai',
};

/** Provider id → provider 映射 */
const ID_TO_PROVIDER: Record<string, string> = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'google',
  deepseek: 'openai',   // DeepSeek uses OpenAI-compatible API
};

/**
 * Migrate old settings format to new format.
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

  // Migrate thinkingLevel: 'minimal' → 'low'
  if (agent.thinkingLevel === 'minimal') {
    agent.thinkingLevel = 'low';
  }

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

  // Migrate provider configs: old `type` → new `apiType`+`provider`
  if (Array.isArray(agent.providerConfigs)) {
    const activeModelId = (agent.activeModelId as string) || '';
    const activeProviderId = (agent.activeProviderId as string) || '';

    agent.providerConfigs = (agent.providerConfigs as Record<string, unknown>[]).map(c => {
      // Already migrated to new format
      if (c.apiType) return c;

      const id = (c.id as string) || '';
      const oldType = (c.type as string) || 'openai';

      // Convert old type → apiType
      const apiType = TYPE_TO_API_TYPE[oldType] || 'openai-completions';

      // Determine provider from id
      const provider = ID_TO_PROVIDER[id] || id;

      // Determine icon
      let icon = (c.icon as string) || '';
      if (!icon) {
        if (id === 'anthropic') icon = 'Anthropic';
        else if (id === 'openai') icon = 'OpenAI';
        else if (id === 'google') icon = 'Gemini';
        else if (id === 'deepseek') icon = 'DeepSeek';
      }

      // Remove old fields
      const { type: _type, extraParams: _extra, customHeaders: _headers, ...rest } = c;
      void _type;
      void _extra;
      void _headers;

      return {
        ...rest,
        apiType,
        provider,
        icon,
        modelId: c.modelId || (id === activeProviderId ? activeModelId : ''),
      };
    });
  }

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
