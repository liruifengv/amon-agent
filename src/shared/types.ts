// ==================== ID 类型 ====================

export type Id = string;

// ==================== 图片附件 ====================

export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export interface ImageAttachment {
  id: Id;
  filename: string;
  mimeType: ImageMimeType;
  base64Data: string;
  size: number;
}

// ==================== 内容块类型 ====================

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: Id;
  name: string;
  input: Record<string, unknown>;
  parentToolUseId?: Id;
}

export interface ToolResultBlock {
  type: 'tool_result';
  toolUseId: Id;
  output: string;
  isError: boolean;
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock;

// ==================== 停止原因 ====================

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'error';

// ==================== Token 用量 ====================

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

// ==================== 消息类型 ====================

export interface UserMessage {
  id: Id;
  role: 'user';
  content: string;
  images?: ImageAttachment[];
  timestamp: number;
}

export interface AssistantMessage {
  id: Id;
  role: 'assistant';
  content: ContentBlock[];
  provider?: string;
  model?: string;
  usage?: TokenUsage;
  stopReason?: StopReason;
  timestamp: number;
}

export type Message = UserMessage | AssistantMessage;

// ==================== 会话 ====================

export interface Session {
  id: Id;
  title: string;
  workspace: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionState {
  session: Session;
  messages: Message[];
}

// ==================== 流式渲染状态（仅 Renderer 内存） ====================

export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'error';

export interface ToolCallState {
  status: ToolCallStatus;
  inputBuffer?: string;
  output?: string;
  isError?: boolean;
}

export interface StreamingState {
  isStreaming: boolean;
  blockCompletionMap: Record<number, boolean>;
  toolCallStates: Record<Id, ToolCallState>;
}

// ==================== Agent 配置 ====================

export interface AgentConfig {
  provider: string;
  model: string;
  systemPrompt: string;
  thinkingBudget?: number;
  maxTurns: number;
}

// ==================== 消息参数 ====================

export interface MessageParams {
  prompt: string;
  sessionId: string;
  images?: ImageAttachment[];
}

// ==================== 文件信息（用于 @ 提及）====================

export interface FileInfo {
  path: string;
  name: string;
  extension?: string;
}
