// ==================== 设置相关类型 (从 schema 导入) ====================

// 从 schemas.ts 导出设置相关类型
export type { Settings, AgentSettings, Shortcuts, PermissionMode, Workspace, Provider } from './schemas';
export { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS, DEFAULT_AGENT_SETTINGS } from './schemas';

// 导入 PermissionMode 用于本地类型定义
import type { PermissionMode } from './schemas';

// ==================== 图片附件类型 ====================

/**
 * 支持的图片 MIME 类型
 */
export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

/**
 * 图片附件
 */
export interface ImageAttachment {
  id: string;
  filename: string;
  mimeType: ImageMimeType;
  base64Data: string;  // 不含 data:xxx;base64, 前缀
  size: number;        // 文件大小（字节）
}

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

// ==================== 消息内容块类型 ====================

/**
 * 内容块基础字段（用于流式追踪）
 */
interface ContentBlockBase {
  /** 内容块唯一标识 */
  id: string;
  /** 是否已完成流式传输 */
  isComplete?: boolean;
}

/**
 * 文本内容块
 */
export interface TextContentBlock extends ContentBlockBase {
  type: 'text';
  content: string;
}

/**
 * 思考内容块
 */
export interface ThinkingContentBlock extends ContentBlockBase {
  type: 'thinking';
  content: string;
}

/**
 * 工具调用内容块
 */
export interface ToolCallContentBlock {
  type: 'tool_call';
  toolCall: ToolCall;
}

/**
 * 权限记录内容块
 */
export interface PermissionContentBlock {
  type: 'permission';
  permission: PermissionRecord;
}

/**
 * 用户问题内容块
 */
export interface UserQuestionContentBlock {
  type: 'user_question';
  userQuestion: UserQuestionRecord;
}

/**
 * 计划审批内容块
 */
export interface PlanApprovalContentBlock {
  type: 'plan_approval';
  planApproval: PlanApprovalRecord;
}

/**
 * 消息内容块联合类型
 */
export type MessageContentBlock =
  | TextContentBlock
  | ThinkingContentBlock
  | ToolCallContentBlock
  | PermissionContentBlock
  | UserQuestionContentBlock
  | PlanApprovalContentBlock;

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
  images?: ImageAttachment[]; // 用户消息附带的图片
  timestamp: string;
  isStreaming?: boolean;
  tokenUsage?: TokenUsage; // Token 用量信息
}

export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'error';

/**
 * 工具调用
 */
export interface ToolCall {
  /** 工具调用 ID（来自 SDK） */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具输入参数 */
  input: Record<string, unknown>;
  /** 流式输入缓冲（用于渐进显示大型输入） */
  inputBuffer?: string;
  /** 工具输出结果 */
  output?: string;
  /** 执行状态 */
  status: ToolCallStatus;
  /** 是否执行出错 */
  isError?: boolean;
  /** 父工具调用 ID（Subagent 场景） */
  parentToolUseId?: string | null;
}

// ==================== SDK 消息类型 ====================

export type SDKMessageType =
  | 'system'
  | 'user'
  | 'assistant'
  | 'result'
  | 'stream_event'
  | 'tool_progress';

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
    stop_reason?: string;
    usage?: SDKUsage;
  };
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  usage?: SDKUsage; // Token 用量
  errors?: string[];
  // 流式事件字段
  event?: StreamEvent;
  // 父工具调用 ID（Subagent 场景）
  parent_tool_use_id?: string | null;
  // tool_progress 专用字段
  tool_use_id?: string;
  tool_name?: string;
  elapsed_time_seconds?: number;
}

// 流式事件类型
export type StreamEventType =
  | 'message_start'
  | 'content_block_start'
  | 'content_block_delta'
  | 'content_block_stop'
  | 'message_delta'
  | 'message_stop';

/**
 * 流式事件
 */
export interface StreamEvent {
  type: StreamEventType | string;
  index?: number;

  // content_block_start 时的内容块信息
  content_block?: {
    type: 'text' | 'thinking' | 'tool_use';
    id?: string;      // tool_use 时有
    name?: string;    // tool_use 时有
    text?: string;    // text 时可能有初始内容
  };

  // content_block_delta 时的增量数据
  delta?: {
    type: 'text_delta' | 'thinking_delta' | 'input_json_delta' | string;
    text?: string;
    thinking?: string;
    partial_json?: string;
    stop_reason?: string;
  };

  // message_delta 时的用量数据
  usage?: {
    output_tokens?: number;
  };

  // message 信息（message_start 时）
  message?: {
    id?: string;
    model?: string;
    role?: string;
  };
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | unknown[]; is_error?: boolean }
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

// ==================== 计划审批相关类型 ====================

/**
 * 计划审批请求
 */
export interface PlanApprovalRequest {
  id: string;
  sessionId: string;
  plan: string; // Markdown 格式的计划内容
  timestamp: string;
}

/**
 * 计划审批响应
 */
export interface PlanApprovalResponse {
  approved: boolean;
  message?: string; // 用户反馈或拒绝原因
}

/**
 * 计划审批记录（用于消息内容块）
 */
export interface PlanApprovalRecord {
  id: string;
  plan: string;
  approved?: boolean;
  message?: string;
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

// ==================== Workspace 相关类型 ====================

/**
 * 文件信息（用于 @ 提及）
 */
export interface FileInfo {
  path: string;       // 相对 workspace 路径
  name: string;       // 文件名
  extension?: string; // 文件扩展名
}

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
 * 消息完成数据
 */
export interface MessageCompleteData {
  sessionId: string;
  success: boolean;
  result?: string;
  cost?: number;
  duration?: number;
  usage?: SDKUsage;
  errors?: string[];
}

// ==================== 消息选项类型 ====================

/**
 * 临时消息选项（覆盖全局设置）
 */
export interface MessageOptions {
  /** 临时权限模式（覆盖全局设置，仅对当前消息生效） */
  permissionMode?: PermissionMode;
}

/**
 * Agent 消息参数
 */
export interface MessageParams {
  prompt: string;
  sessionId: string;
  sdkSessionId?: string;
  options?: MessageOptions;
  images?: ImageAttachment[];
}
