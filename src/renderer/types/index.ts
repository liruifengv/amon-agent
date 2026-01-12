// 从 shared 重新导出共享类型
export type {
  Session,
  Message,
  MessageContentBlock,
  ToolCall,
  Settings,
  AgentSettings,
  Shortcuts,
  PermissionMode,
  Workspace,
  SDKMessageType,
  SDKMessage,
  SDKUsage,
  TokenUsage,
  ContentBlock,
  StreamEvent,
  ToolPermissionRequest,
  PermissionResult,
  PermissionResultAllow,
  PermissionResultDeny,
  PermissionRecord,
  AskUserQuestion,
  AskUserQuestionOption,
  AskUserQuestionInput,
  AskUserQuestionRequest,
  AskUserQuestionResponse,
  UserQuestionRecord,
  Skill,
  SkillMetadata,
  SkillSource,
  SkillsLoadResult,
  WorkspaceSkills,
  RecommendedSkill,
  SkillInstallTarget,
  QueryOptions,
} from '../../shared/types';

// 导出常量
export { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS, DEFAULT_AGENT_SETTINGS } from '../../shared/types';

import type {
  Session,
  Settings,
  Message,
  SDKUsage,
  ToolPermissionRequest,
  PermissionResult,
  AskUserQuestionRequest,
  SkillsLoadResult,
  RecommendedSkill,
  SkillInstallTarget,
  QueryOptions,
} from '../../shared/types';

export interface ElectronAPI {
  agent: {
    query: (prompt: string, sessionId: string, options?: QueryOptions) => Promise<{ success: boolean; error?: string }>;
    interrupt: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    onMessagesUpdated: (callback: (data: { sessionId: string; messages: Message[] }) => void) => void;
    offMessagesUpdated: (callback: (data: { sessionId: string; messages: Message[] }) => void) => void;
    onQueryState: (callback: (data: { sessionId: string; isLoading: boolean }) => void) => void;
    offQueryState: (callback: (data: { sessionId: string; isLoading: boolean }) => void) => void;
    onQueryComplete: (callback: (data: { sessionId: string; success: boolean; result?: string; cost?: number; duration?: number; usage?: SDKUsage; errors?: string[] }) => void) => void;
    offQueryComplete: (callback: (data: { sessionId: string; success: boolean; result?: string; cost?: number; duration?: number; usage?: SDKUsage; errors?: string[] }) => void) => void;
    onQueryError: (callback: (data: { sessionId: string; error: string }) => void) => void;
    offQueryError: (callback: (data: { sessionId: string; error: string }) => void) => void;
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
    onSdkSessionId: (callback: (data: { sessionId: string; sdkSessionId: string }) => void) => void;
    offSdkSessionId: (callback: (data: { sessionId: string; sdkSessionId: string }) => void) => void;
  };
  settings: {
    get: () => Promise<Settings>;
    set: (settings: Partial<Settings>) => Promise<{ success: boolean; data?: Settings; errors?: { field: string; message: string }[] }>;
    onChange: (callback: (settings: Settings) => void) => void;
    offChange: (callback: (settings: Settings) => void) => void;
  };
  window: {
    openSettings: () => Promise<{ success: boolean }>;
    closeSettings: () => Promise<{ success: boolean }>;
  };
  shell: {
    openConfigDir: () => Promise<{ success: boolean }>;
    openPath: (path: string) => Promise<{ success: boolean }>;
  };
  dialog: {
    selectFolder: () => Promise<{ success: boolean; path: string | null }>;
    confirm: (options: { title: string; message: string; detail?: string }) => Promise<{ confirmed: boolean }>;
  };
  shortcuts: {
    onNewSession: (callback: () => void) => void;
    offNewSession: (callback: () => void) => void;
  };
  permission: {
    respond: (requestId: string, result: PermissionResult) => Promise<{ success: boolean }>;
    onRequest: (callback: (request: ToolPermissionRequest) => void) => void;
    offRequest: (callback: (request: ToolPermissionRequest) => void) => void;
  };
  askUserQuestion: {
    respond: (requestId: string, answers: Record<string, string>) => Promise<{ success: boolean }>;
    onRequest: (callback: (request: AskUserQuestionRequest) => void) => void;
    offRequest: (callback: (request: AskUserQuestionRequest) => void) => void;
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
}

// 扩展 Window 类型
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
