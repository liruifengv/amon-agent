// ==================== 设置相关类型 (从 schema 导入) ====================

// 从 schemas.ts 导出设置相关类型
export type { Settings, AgentSettings, Shortcuts, PermissionMode, Workspace, Provider } from './schemas';
export { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS, DEFAULT_AGENT_SETTINGS } from './schemas';

// 导入 PermissionMode 用于本地类型定义
import type { PermissionMode } from './schemas';

// ==================== 会话相关类型 ====================

export interface Session {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  systemPrompt?: string;
  // SDK 返回的 session ID，用于连续对话
  sdkSessionId?: string;
  // 工作空间路径（cwd）
  workspace?: string;
}

// 权限响应记录（用于消息内容块）
export interface PermissionRecord {
  toolName: string;
  input: Record<string, unknown>;
  result: 'allow' | 'deny';
  timestamp: string;
}

// 消息内容块类型
export type MessageContentBlock =
  | { type: 'thinking'; content: string }
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'permission'; permission: PermissionRecord }
  | { type: 'user_question'; userQuestion: UserQuestionRecord };

// Token 用量信息
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  cost?: number; // 成本（美元）
  duration?: number; // 耗时（毫秒）
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string; // 保留用于用户消息和向后兼容
  contentBlocks?: MessageContentBlock[]; // 助手消息的有序内容块
  timestamp: string;
  isStreaming?: boolean;
  tokenUsage?: TokenUsage; // Token 用量信息
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
}

// ==================== SDK 消息类型 ====================

export type SDKMessageType =
  | 'system'
  | 'user'
  | 'assistant'
  | 'result'
  | 'stream_event';

// SDK Usage 类型
export interface SDKUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface SDKMessage {
  type: SDKMessageType;
  subtype?: string;
  session_id?: string;
  uuid?: string;
  message?: {
    role: string;
    content: ContentBlock[];
  };
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  usage?: SDKUsage; // Token 用量
  errors?: string[];
  // 流式事件字段
  event?: StreamEvent;
  parent_tool_use_id?: string | null;
}

// 流式事件类型
export interface StreamEvent {
  type: string;
  index?: number;
  delta?: {
    type: string;
    text?: string;
    partial_json?: string;
    thinking?: string;
  };
  content_block?: {
    type: string;
    id?: string;
    name?: string;
    text?: string;
  };
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }
  | { type: 'thinking'; thinking: string };

// ==================== 权限请求类型 ====================

/**
 * 工具权限请求
 */
export interface ToolPermissionRequest {
  id: string;
  sessionId: string;
  toolName: string;
  input: Record<string, unknown>;
  timestamp: string;
}

/**
 * 权限响应 - 允许
 */
export interface PermissionResultAllow {
  behavior: 'allow';
  updatedInput: Record<string, unknown>;
}

/**
 * 权限响应 - 拒绝
 */
export interface PermissionResultDeny {
  behavior: 'deny';
  message: string;
}

export type PermissionResult = PermissionResultAllow | PermissionResultDeny;

/**
 * AskUserQuestion 问题选项
 */
export interface AskUserQuestionOption {
  label: string;
  description: string;
}

/**
 * AskUserQuestion 问题
 */
export interface AskUserQuestion {
  question: string;
  header: string;
  options: AskUserQuestionOption[];
  multiSelect: boolean;
}

/**
 * AskUserQuestion 输入
 */
export interface AskUserQuestionInput {
  questions: AskUserQuestion[];
}

/**
 * AskUserQuestion 响应
 */
export interface AskUserQuestionResponse {
  questions: AskUserQuestion[];
  answers: Record<string, string>;
}

/**
 * AskUserQuestion 请求
 */
export interface AskUserQuestionRequest {
  id: string;
  sessionId: string;
  questions: AskUserQuestion[];
  timestamp: string;
}

/**
 * 用户问题记录（用于消息内容块）
 */
export interface UserQuestionRecord {
  questions: AskUserQuestion[];
  answers: Record<string, string>;
  timestamp: string;
}

// ==================== Skills 相关类型 ====================

/**
 * Skill 元数据（从 SKILL.md frontmatter 解析）
 */
export interface SkillMetadata {
  name: string;
  description: string;
  license?: string;
}

/**
 * Skill 信息
 */
export interface Skill {
  id: string; // 唯一标识（基于路径生成）
  metadata: SkillMetadata;
  path: string; // Skill 文件夹路径
  skillMdPath: string; // SKILL.md 文件路径
  source: SkillSource; // 来源
}

/**
 * Skill 来源
 */
export interface SkillSource {
  type: 'system' | 'workspace';
  workspacePath?: string; // workspace 类型时的工作空间路径
  workspaceName?: string; // workspace 类型时的工作空间名称
}

/**
 * Skills 加载结果
 */
export interface SkillsLoadResult {
  systemSkills: Skill[]; // 系统级 skills（~/.claude/skills）
  workspaceSkills: WorkspaceSkills[]; // 各工作空间的 skills
}

/**
 * 工作空间的 Skills
 */
export interface WorkspaceSkills {
  workspacePath: string;
  workspaceName: string;
  skills: Skill[];
}

/**
 * 推荐 Skill 信息
 */
export interface RecommendedSkill {
  id: string;
  metadata: SkillMetadata;
  repoPath: string; // GitHub 仓库中的路径 (e.g., "skills/pdf")
  installed: boolean; // 是否已安装
  installedAt?: 'system' | 'workspace'; // 安装位置
  installedWorkspace?: string; // 工作空间名称（如果安装到工作空间）
}

/**
 * Skill 安装目标
 */
export type SkillInstallTarget = 'system' | 'workspace';

// ==================== IPC 结果类型 ====================

/**
 * 设置保存结果
 */
export interface SettingsSetResult {
  success: boolean;
  data?: import('./schemas').Settings;
  errors?: { field: string; message: string }[];
}

/**
 * 查询完成数据
 */
export interface QueryCompleteData {
  sessionId: string;
  success: boolean;
  result?: string;
  cost?: number;
  duration?: number;
  usage?: SDKUsage;
  errors?: string[];
}

// ==================== 查询选项类型 ====================

/**
 * 临时查询选项（覆盖全局设置）
 */
export interface QueryOptions {
  /** 临时权限模式（覆盖全局设置，仅对当前查询生效） */
  permissionMode?: PermissionMode;
}

/**
 * Agent 查询参数
 */
export interface QueryParams {
  prompt: string;
  sessionId: string;
  sdkSessionId?: string;
  options?: QueryOptions;
}
