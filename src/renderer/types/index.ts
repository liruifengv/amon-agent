// 从 shared 重新导出共享类型
export type {
  Session,
  Message,
  UserMessage,
  AssistantMessage,
  AssistantContentBlock,
  TextContentBlock,
  ThinkingContentBlock,
  ToolCallContentBlock,
  ToolCallStatus,
  TokenUsage,
  Settings,
  AgentSettings,
  ProviderConfig,
  ProviderInfo,
  ModelInfo,
  Shortcuts,
  Workspace,
  Skill,
  SkillMetadata,
  SkillSource,
  SkillsLoadResult,
  WorkspaceSkills,
  RecommendedSkill,
  SkillInstallTarget,
  SettingsSetResult,
  MessageCompleteData,
  MessageParams,
  ImageAttachment,
  ImageMimeType,
  FileInfo,
} from '../../shared/types';

// 导出常量
export { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS, DEFAULT_AGENT_SETTINGS } from '../../shared/types';

import type {
  Session,
  Settings,
  Message,
  SkillsLoadResult,
  RecommendedSkill,
  SkillInstallTarget,
  SettingsSetResult,
  MessageCompleteData,
  ImageAttachment,
  FileInfo,
  ProviderInfo,
  ModelInfo,
} from '../../shared/types';

export interface ElectronAPI {
  agent: {
    sendMessage: (prompt: string, sessionId: string, images?: ImageAttachment[]) => Promise<{ success: boolean; error?: string }>;
    interrupt: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    getProviders: () => Promise<{ success: boolean; providers: ProviderInfo[] }>;
    getModels: (provider: string) => Promise<{ success: boolean; models: ModelInfo[] }>;
    onMessagesUpdated: (callback: (data: { sessionId: string; messages: Message[] }) => void) => void;
    offMessagesUpdated: (callback: (data: { sessionId: string; messages: Message[] }) => void) => void;
    onMessageState: (callback: (data: { sessionId: string; isLoading: boolean }) => void) => void;
    offMessageState: (callback: (data: { sessionId: string; isLoading: boolean }) => void) => void;
    onMessageComplete: (callback: (data: MessageCompleteData) => void) => void;
    offMessageComplete: (callback: (data: MessageCompleteData) => void) => void;
    onMessageError: (callback: (data: { sessionId: string; error: string }) => void) => void;
    offMessageError: (callback: (data: { sessionId: string; error: string }) => void) => void;
  };
  session: {
    list: () => Promise<Session[]>;
    create: (params?: string | { name?: string; workspace?: string }) => Promise<Session>;
    delete: (sessionId: string) => Promise<boolean>;
    rename: (sessionId: string, name: string) => Promise<Session | null>;
    updateWorkspace: (sessionId: string, workspace: string) => Promise<{ success: boolean; session?: Session }>;
    getMessages: (sessionId: string) => Promise<Message[]>;
    getLoadingStates: () => Promise<Record<string, boolean>>;
    onCreated: (callback: (session: Session) => void) => void;
    offCreated: (callback: (session: Session) => void) => void;
    onDeleted: (callback: (data: { sessionId: string }) => void) => void;
    offDeleted: (callback: (data: { sessionId: string }) => void) => void;
    onUpdated: (callback: (session: Session) => void) => void;
    offUpdated: (callback: (session: Session) => void) => void;
  };
  settings: {
    get: () => Promise<Settings>;
    set: (settings: Partial<Settings>) => Promise<SettingsSetResult>;
    onChange: (callback: (settings: Settings) => void) => void;
    offChange: (callback: (settings: Settings) => void) => void;
  };
  window: {
    openSettings: (tab?: string) => Promise<{ success: boolean }>;
    closeSettings: () => Promise<{ success: boolean }>;
  };
  shell: {
    openConfigDir: () => Promise<{ success: boolean }>;
    openPath: (path: string) => Promise<{ success: boolean }>;
    openExternal: (url: string) => Promise<{ success: boolean }>;
  };
  dialog: {
    selectFolder: () => Promise<{ success: boolean; path: string | null }>;
    selectImages: () => Promise<{ success: boolean; images: ImageAttachment[] }>;
    confirm: (options: { title: string; message: string; detail?: string }) => Promise<{ confirmed: boolean }>;
  };
  shortcuts: {
    onNewSession: (callback: () => void) => void;
    offNewSession: (callback: () => void) => void;
  };
  cli: {
    onSessionCreated: (callback: (data: { sessionId: string }) => void) => void;
    offSessionCreated: (callback: (data: { sessionId: string }) => void) => void;
  };
  skills: {
    load: () => Promise<SkillsLoadResult>;
    listRecommended: () => Promise<RecommendedSkill[]>;
    install: (skillId: string, target: SkillInstallTarget, workspacePath?: string) => Promise<{ success: boolean; error?: string }>;
    uninstall: (skillPath: string) => Promise<{ success: boolean; error?: string }>;
  };
  workspace: {
    listFiles: (sessionId: string, query?: string, limit?: number) => Promise<{ success: boolean; files: FileInfo[] }>;
    validatePaths: (sessionId: string, paths: string[]) => Promise<{ success: boolean; validPaths: string[] }>;
  };
  app: {
    getVersion: () => Promise<{ success: boolean; version: string }>;
  };
}

// 扩展 Window 类型
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
