import { z } from 'zod';
import { ApprovalModeSchema } from './permission-types';
import { getCatalogModelByServiceModelId, getConnectionSpec, listConnectionSpecs } from './ai-catalog';

// ==================== Connection 配置 Schema ====================

export const ConnectionAuthConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('apiKey'),
    credentialId: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal('oauth'),
  }),
]);

export const ConnectionConfigSchema = z.object({
  id: z.string(),
  specId: z.string().min(1),
  name: z.string().min(1),
  baseUrl: z.string().optional(),
  modelKey: z.string().min(1),
  customModelId: z.string().default(''),
  auth: ConnectionAuthConfigSchema.default({ type: 'apiKey' }),
  // Transitional field while API keys are still stored in settings.
  apiKey: z.string().default(''),
});

export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>;

// ==================== Agent 配置 Schema ====================

export const CompactionSettingsSchema = z.object({
  reserveTokens: z.number().int().positive().default(16384),
  keepRecentTokens: z.number().int().positive().default(20000),
  autoCompact: z.boolean().default(true),
});

export type CompactionSettings = z.infer<typeof CompactionSettingsSchema>;

export const AgentSettingsSchema = z.object({
  activeConnectionId: z.string().nullable().default(null),
  maxTurns: z.number().default(50),
  thinkingLevel: z.enum(['off', 'low', 'medium', 'high', 'xhigh']).default('medium'),
  defaultApprovalMode: ApprovalModeSchema.default('ask'),
  connections: z.array(ConnectionConfigSchema).default([]),
  exaApiKey: z.string().default(''),
  compaction: CompactionSettingsSchema.default({
    reserveTokens: 16384,
    keepRecentTokens: 20000,
    autoCompact: true,
  }),
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
  chatWidth: z.enum(['narrow', 'wide']).default('narrow'),
  shortcuts: ShortcutsSchema.default(DEFAULT_SHORTCUTS),
  workspaces: z.array(WorkspaceSchema).default([]),
  agent: AgentSettingsSchema.default(DEFAULT_AGENT_SETTINGS),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

type LegacyProviderConfig = {
  id?: string;
  apiType?: string;
  provider?: string;
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
  auth?: {
    type?: 'apiKey' | 'oauth';
    strategy?: 'openai-codex';
  };
};

function findSpecIdForLegacyConfig(config: LegacyProviderConfig): string | undefined {
  const provider = config.provider;
  const apiType = config.apiType;
  if (!provider || !apiType) {
    return undefined;
  }

  const candidates = listConnectionSpecs().filter(
    (spec) => spec.serviceId === provider && spec.transport === apiType,
  );

  if (candidates.length === 0) {
    return undefined;
  }

  if (config.baseUrl) {
    const exact = candidates.find((spec) => spec.defaultBaseUrl === config.baseUrl);
    if (exact) {
      return exact.id;
    }
  }

  const idMatch = candidates.find((spec) => spec.id === config.id);
  return idMatch?.id ?? candidates[0]?.id;
}

function migrateLegacyProviderConfig(config: LegacyProviderConfig): ConnectionConfig | null {
  const specId = findSpecIdForLegacyConfig(config);
  if (!specId) {
    return null;
  }

  const spec = getConnectionSpec(specId);
  const modelKey = config.modelId
    ? getCatalogModelByServiceModelId(spec.serviceId, config.modelId)?.key
    : undefined;

  return {
    id: config.id || specId,
    specId,
    name: config.name || spec.name,
    baseUrl: config.baseUrl || spec.defaultBaseUrl,
    modelKey: modelKey || spec.defaultModelKey,
    customModelId: config.modelId && !modelKey ? config.modelId : '',
    auth: config.auth?.type === 'oauth' ? { type: 'oauth' } : { type: 'apiKey' },
    apiKey: config.apiKey || '',
  };
}

function migrateSettings(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const raw = { ...(data as Record<string, unknown>) };

  if (raw.agent && typeof raw.agent === 'object') {
    raw.agent = { ...(raw.agent as Record<string, unknown>) };
  }

  const agent = (raw.agent || {}) as Record<string, unknown>;

  const legacyProviderConfigs = Array.isArray(agent.providerConfigs)
    ? agent.providerConfigs as LegacyProviderConfig[]
    : Array.isArray(raw.providers)
      ? raw.providers as LegacyProviderConfig[]
      : undefined;
  delete raw.providers;

  delete agent.thinkingBudget;
  delete agent.customSystemPrompt;

  if (agent.thinkingLevel === 'minimal') {
    agent.thinkingLevel = 'low';
  }

  if (agent.compaction && typeof agent.compaction === 'object') {
    const compaction = { ...(agent.compaction as Record<string, unknown>) };
    if (
      compaction.autoCompact === undefined
      && typeof compaction.enabled === 'boolean'
    ) {
      compaction.autoCompact = compaction.enabled;
    }
    delete compaction.enabled;
    agent.compaction = compaction;
  }

  if (!agent.connections && legacyProviderConfigs) {
    const connections = legacyProviderConfigs
      .map(migrateLegacyProviderConfig)
      .filter((config): config is ConnectionConfig => config !== null);

    agent.connections = connections;

    const activeConnectionId = typeof agent.activeConnectionId === 'string'
      ? agent.activeConnectionId
      : typeof agent.activeProviderId === 'string'
        ? agent.activeProviderId
      : undefined;
    const activeConnection = connections.find((connection) => connection.id === activeConnectionId);
    agent.activeConnectionId = activeConnection?.id ?? connections[0]?.id ?? null;
  }

  delete agent.activeProviderId;
  delete agent.activeModelId;
  delete agent.provider;
  delete agent.model;
  delete agent.providerConfigs;

  raw.agent = agent;

  if (Array.isArray(raw.workspaces)) {
    raw.workspaces = (raw.workspaces as Record<string, unknown>[]).map((workspace, index) => ({
      ...workspace,
      id: workspace.id || `ws_${index}`,
      isDefault: workspace.isDefault ?? false,
    }));
  }

  delete raw.defaultWorkspace;
  return raw;
}

// ==================== 校验函数 ====================

export function parseSettings(data: unknown): Settings {
  const migrated = migrateSettings(data);

  const result = SettingsSchema.safeParse(migrated);
  if (result.success) return result.data;

  console.warn('Settings validation failed, using defaults', result.error.issues);
  return DEFAULT_SETTINGS;
}
