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

export interface ServerToolUseBlock {
  type: 'server_tool_use';
  id: Id;
  name: string;
  input: Record<string, unknown>;
  callerType?: string;
  callerToolId?: Id;
}

export interface ServerToolResultBlock {
  type: 'server_tool_result';
  toolUseId: Id;
  resultType: string;
  content: unknown;
  callerType?: string;
  callerToolId?: Id;
}

export interface CodeExecutionResultContent {
  type: 'code_execution_result';
  stdout: string;
  stderr: string;
  return_code: number;
  content: unknown[];
  abort_reason: string | null;
}

export interface WebFetchResultContent {
  type: 'web_fetch_result';
  url: string;
  retrieved_at: string;
  content: unknown;
}

export interface WebSearchResultItem {
  type: 'web_search_result';
  url: string;
  title: string;
  encrypted_content: string;
  page_age?: string;
}

export interface WebSearchResultContent {
  type: 'web_search_tool_result';
  items: WebSearchResultItem[];
}

export type ContentBlock =
  | TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock
  | ServerToolUseBlock | ServerToolResultBlock;

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

// ==================== Skills 类型 ====================

/** Skill 来源层级 */
export type SkillSource =
  | 'extra'             // 用户配置的额外目录（含 .claude 等）
  | 'system-amon'       // ~/.amon/skills/
  | 'project-amon';     // <workspace>/.amon/skills/

/** agentskills.io 规范 + Claude Code 扩展的完整 frontmatter */
export interface SkillFrontmatter {
  // === agentskills.io 规范字段 ===
  name?: string;
  description?: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  'allowed-tools'?: string;

  // === Claude Code 扩展字段 ===
  'disable-model-invocation'?: boolean;
  'user-invocable'?: boolean;
  'argument-hint'?: string;
  model?: string;
  context?: string;
  agent?: string;
  hooks?: unknown;

  [key: string]: unknown;
}

/** 加载后的 Skill 对象 */
export interface Skill {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: SkillSource;
  frontmatter: SkillFrontmatter;
  disableModelInvocation: boolean;
  userInvocable: boolean;
}

/** Skills 加载诊断信息 */
export interface SkillDiagnostic {
  type: 'warning' | 'error' | 'collision';
  message: string;
  path: string;
  collision?: {
    name: string;
    winnerPath: string;
    loserPath: string;
  };
}

/** Skills 加载结果 */
export interface SkillsLoadResult {
  skills: Skill[];
  diagnostics: SkillDiagnostic[];
}
