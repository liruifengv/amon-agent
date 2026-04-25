// ==================== 从 src/ai 直接 re-export 消息类型 ====================

import type { ApprovalMode } from './permission-types';
export type {
  ConnectionAuthConfig,
  ConnectionAuthStatus,
  ConnectionAuthState,
  ResolvedRequestAuth,
  AuthSession,
} from './connection-auth';

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
  Api,
  KnownApi,
  Provider,
  KnownProvider,
  Model,
  Tool as AiTool,
  Context,
  ThinkingLevel as AiThinkingLevel,
} from '../ai/types';

// ==================== 图片附件 ====================

export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export interface ImageAttachment {
  id: string;
  filename: string;
  mimeType: ImageMimeType;
  base64Data: string;
  size: number;
}

// ==================== 会话 ====================

export interface Session {
  id: string;
  title: string;
  workspace: string;
  approvalMode: ApprovalMode;
  createdAt: number;
  updatedAt: number;
}

export type CompactionSource = 'auto-threshold' | 'auto-overflow' | 'manual';

export interface CompactionSnapshot {
  summary: string;
  firstKeptMessageIndex: number;
  tokensBefore: number;
  tokensAfter?: number;
  createdAt: number;
  source: CompactionSource;
}

export interface CompactionNotice {
  firstKeptMessageIndex: number;
  tokensBefore: number;
  tokensAfter?: number;
  createdAt: number;
  source: CompactionSource;
}

export interface CompactionMessage {
  role: 'compaction';
  source: CompactionSource;
  tokensBefore: number;
  tokensAfter?: number;
  timestamp: number;
}

export type SessionMessage = import('../ai/types').Message | CompactionMessage;

export interface SessionState {
  session: Session;
  messages: SessionMessage[];
  compactionSnapshot?: CompactionSnapshot;
}

// ==================== Agent 运行状态（替代旧 StreamingState）====================

export interface AgentRunState {
  isRunning: boolean;
  toolExecutions: Record<string, ToolExecutionState>;
  contextWindow?: number;
  contextTokens?: number;
  lastCompaction?: CompactionNotice | null;
}

export interface ToolExecutionState {
  toolName: string;
  status: 'pending' | 'awaiting_approval' | 'awaiting_user_input' | 'running' | 'completed' | 'error';
  partialResult?: string;
  isError?: boolean;
}

declare module '../agent/types' {
  interface CustomAgentMessages {
    compaction: CompactionMessage;
  }
}

// ==================== 文件信息（用于 @ 提及）====================

export interface FileInfo {
  path: string;
  name: string;
  extension?: string;
}
