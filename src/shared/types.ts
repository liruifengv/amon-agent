// ==================== 设置相关类型 (从 schema 导入) ====================

// 从 schemas.ts 导出设置相关类型
export type { Settings, AgentSettings, Shortcuts, Workspace, ProviderConfig } from './schemas';
export { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS, DEFAULT_AGENT_SETTINGS } from './schemas';

// ==================== Provider/Model 信息类型 ====================

/** getProviders() 返回的 provider 摘要信息 */
export interface ProviderInfo {
  id: string;
  name: string;
}

/** getModels(provider) 返回的 model 摘要信息 */
export interface ModelInfo {
  id: string;
  name: string;
  reasoning: boolean;
}

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
  // 工作空间路径（cwd）
  workspace?: string;
  // 数据格式版本号（用于区分新旧格式）
  version?: number;
}

// ==================== 消息内容块类型 ====================

/**
 * 文本内容块
 */
export interface TextContentBlock {
  type: 'text';
  text: string;
  /** 是否已完成流式传输 */
  isComplete?: boolean;
}

/**
 * 思考内容块
 */
export interface ThinkingContentBlock {
  type: 'thinking';
  thinking: string;
  /** 是否已完成流式传输 */
  isComplete?: boolean;
}

/**
 * 工具调用执行状态
 */
export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'error';

/**
 * 工具调用内容块
 */
export interface ToolCallContentBlock {
  type: 'toolCall';
  /** 工具调用 ID（来自 LLM） */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具参数 */
  arguments: Record<string, any>;
  /** 执行状态 */
  status: ToolCallStatus;
  /** 工具执行结果 */
  output?: string;
  /** 工具执行详情（pi AgentToolResult.details） */
  outputDetails?: any;
  /** 是否执行出错 */
  isError?: boolean;
  /** 流式输入缓冲（用于渐进显示大型输入） */
  inputBuffer?: string;
}

/**
 * 助手消息内容块联合类型
 */
export type AssistantContentBlock =
  | TextContentBlock
  | ThinkingContentBlock
  | ToolCallContentBlock;

// ==================== 消息类型 ====================

/**
 * 用户消息
 */
export interface UserMessage {
  id: string;
  role: 'user';
  content: string;
  images?: ImageAttachment[];
  timestamp: number;
}

/**
 * 助手消息
 */
export interface AssistantMessage {
  id: string;
  role: 'assistant';
  contentBlocks: AssistantContentBlock[];
  isStreaming?: boolean;
  /** 来源 Provider */
  provider?: string;
  /** 来源模型 */
  model?: string;
  /** Token 用量 */
  usage?: TokenUsage;
  /** 停止原因 */
  stopReason?: string;
  /** 错误信息 */
  errorMessage?: string;
  timestamp: number;
}

/**
 * 消息联合类型（用于 UI 渲染）
 */
export type Message = UserMessage | AssistantMessage;

/**
 * Token 用量
 */
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    total: number;
  };
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
  usage?: TokenUsage;
  errors?: string[];
}

// ==================== 消息参数类型 ====================

/**
 * Agent 消息参数
 */
export interface MessageParams {
  prompt: string;
  sessionId: string;
  images?: ImageAttachment[];
}
