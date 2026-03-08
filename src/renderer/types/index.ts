// ==================== 从 shared 重新导出类型 ====================

export type {
  ImageAttachment,
  ImageMimeType,
  Session,
  SessionState,
  AgentRunState,
  ToolExecutionState,
  FileInfo,
} from '../../shared/types';

// 从 ai 类型重新导出（经由 shared/types）
export type {
  TextContent,
  ThinkingContent,
  ImageContent,
  ToolCall,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  Message,
  Usage,
  StopReason,
} from '../../ai/types';

export type {
  ProviderConfig,
  AgentSettings,
  Settings,
  Workspace,
  Shortcuts,
} from '../../shared/schemas';

export {
  DEFAULT_SETTINGS,
  DEFAULT_AGENT_SETTINGS,
  DEFAULT_SHORTCUTS,
} from '../../shared/schemas';

// ==================== Window 类型声明 ====================

import type { PushEventMap } from '../../shared/ipc-types';
export type { PushEventMap };

// IPC Proxy 类型 — 由 preload 中的 createProxy 生成
type IpcProxy = Record<string, (...args: any[]) => Promise<any>>;

export interface IpcAPI {
  agent: IpcProxy;
  session: IpcProxy;
  settings: IpcProxy;
  system: IpcProxy;
  workspace: IpcProxy;
  dialog: IpcProxy;
  skills: IpcProxy;
}

export interface PushAPI {
  on: <K extends keyof PushEventMap>(
    channel: K,
    callback: (data: PushEventMap[K]) => void,
  ) => () => void;
}

// 扩展 Window 类型
declare global {
  interface Window {
    ipc: IpcAPI;
    push: PushAPI;
  }
}
