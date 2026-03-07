// ==================== 超时与节流 ====================

export const STREAM_THROTTLE_MS = 50;
export const AUTO_SAVE_INTERVAL_MS = 3000;
export const COMMAND_TIMEOUT_MS = 120000;

// ==================== Token 配置 ====================

export const MAX_OUTPUT_TOKENS = 16384;
export const DEFAULT_MAX_THINKING_TOKENS = 10000;

// ==================== Anthropic Adaptive Thinking ====================

/**
 * 支持 adaptive thinking 的 Anthropic 模型前缀列表。
 * 这些模型使用 thinking.type: "adaptive" + output_config.effort，
 * 而非旧的 thinking.type: "enabled" + budget_tokens。
 */
export const ADAPTIVE_THINKING_MODEL_PREFIXES = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
];

// ==================== ThinkingLevel 映射 ====================

/** thinkingLevel 到 Anthropic effort 的映射 */
export const THINKING_LEVEL_TO_EFFORT: Record<string, string> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'max',
};

/** thinkingLevel 到 Anthropic budget_tokens 的映射（旧模型） */
export const THINKING_LEVEL_TO_BUDGET: Record<string, number> = {
  low: 4096,
  medium: 10000,
  high: 32000,
  xhigh: 32000,
};

/** thinkingLevel 到 OpenAI reasoning_effort 的映射 */
export const THINKING_LEVEL_TO_REASONING_EFFORT: Record<string, string> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
};

/** thinkingLevel 到 Gemini thinkingLevel 的映射 */
export const THINKING_LEVEL_TO_GEMINI: Record<string, string> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'high',
};

/** 认证相关 header 黑名单（不区分大小写） */
export const BLOCKED_CUSTOM_HEADERS = ['authorization', 'x-api-key'];

/** 过滤认证相关 header */
export function filterBlockedHeaders(
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  if (!headers || Object.keys(headers).length === 0) return undefined;
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!BLOCKED_CUSTOM_HEADERS.includes(key.toLowerCase())) {
      filtered[key] = value;
    }
  }
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

// ==================== 路径配置 ====================

export const DATA_DIR = '~/.amon';
export const SESSIONS_DIR = '~/.amon/sessions';
export const SETTINGS_PATH = '~/.amon/settings.json';
export const DEFAULT_WORKSPACE_PATH = '~/.amon/workspace';

// ==================== Provider 配置 ====================

export const SUPPORTED_PROVIDERS = ['anthropic', 'openai'] as const;

// ==================== 系统提示词 ====================

export const DEFAULT_SYSTEM_PROMPT = `You are a personal assistant running inside Amon, a desktop AI application.

# Core Principles

1. **Proactive & Thoughtful**: Anticipate needs and offer relevant suggestions. Ask clarifying questions when the task is ambiguous.

2. **Honest & Objective**: Prioritize accuracy over agreement. If the user's approach has issues, respectfully point them out.

3. **Privacy-Conscious**: You run locally on the user's machine. Respect their data and workspace.

4. **Task-Focused**: Stay on topic. Complete tasks thoroughly before moving on.

# Working Style

- **For coding tasks**: Understand the codebase context first. Prefer editing existing files over creating new ones. Write clean, maintainable code.
- **For research tasks**: Be thorough but synthesize information clearly.
- **For writing tasks**: Match the user's voice and style. Be concise unless elaboration is specifically requested.
- **For ambiguous requests**: Ask one or two clarifying questions rather than making assumptions.

# Output Guidelines

- Use markdown formatting when it improves readability
- Keep responses concise - elaborate only when necessary
- For code: include file paths and line numbers when referencing specific locations`;

// ==================== UI 配置 ====================

export const SCROLL_DELAY_MS = 100;
export const LOG_DATA_TRUNCATE_LENGTH = 1000;
