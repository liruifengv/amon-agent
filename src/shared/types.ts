// ==================== 从 src/ai 直接 re-export 消息类型 ====================

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
  createdAt: number;
  updatedAt: number;
}

export interface SessionState {
  session: Session;
  messages: import('../ai/types').Message[];
}

// ==================== Agent 运行状态（替代旧 StreamingState）====================

export interface AgentRunState {
  isRunning: boolean;
  toolExecutions: Record<string, ToolExecutionState>;
  contextWindow?: number;
}

export interface ToolExecutionState {
  toolName: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  partialResult?: string;
  isError?: boolean;
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

/** 前端展示用的技能信息（序列化安全，不含 filePath 等后端字段） */
export interface SkillInfo {
  name: string;
  description: string;
  source: SkillSource;
  /** 技能所在目录的绝对路径（用于"打开文件夹"） */
  dirPath: string;
  /** 是否已禁用 */
  disabled: boolean;
  /** 来源标签显示文本（如 workspace 名称） */
  sourceLabel: string;
  /** SKILL.md 完整内容（仅详情对话框使用，列表请求时可不填） */
  content?: string;
}

/** 内置技能元信息 */
export interface BuiltinSkillMeta {
  name: string;
  description: string;
  /** 是否已安装到 ~/.amon/skills/ */
  installed: boolean;
  /** 是否默认安装 */
  defaultInstall: boolean;
  /** 内置技能资源目录路径（用于读取 SKILL.md） */
  dirPath: string;
}
