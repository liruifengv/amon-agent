// ==================== 从 shared 重新导出类型 ====================

export type {
  Id,
  ImageAttachment,
  ImageMimeType,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  ToolResultBlock,
  ServerToolUseBlock,
  ServerToolResultBlock,
  CodeExecutionResultContent,
  WebFetchResultContent,
  WebSearchResultItem,
  WebSearchResultContent,
  ContentBlock,
  StopReason,
  TokenUsage,
  UserMessage,
  AssistantMessage,
  Message,
  Session,
  SessionState,
  ToolCallStatus,
  ToolCallState,
  StreamingState,
  AgentConfig,
  MessageParams,
  FileInfo,
} from '../../shared/types';

export type {
  ProviderConfig,
  ProviderInfo,
} from '../../shared/provider-types';

export type {
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
// 每个方法对应 ipcMain.handle(prefix.method, handler) 的调用
type IpcProxy = Record<string, (...args: any[]) => Promise<any>>;

export interface IpcAPI {
  agent: IpcProxy;
  session: IpcProxy;
  settings: IpcProxy;
  system: IpcProxy;
  workspace: IpcProxy;
  dialog: IpcProxy;
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
