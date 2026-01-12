import { query } from '@anthropic-ai/claude-agent-sdk';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { SDKMessage, Message, AskUserQuestionInput, QueryOptions } from '../../shared/types';
import { Settings } from '../../shared/schemas';
import { existsSync } from 'fs';
import { join } from 'path';
import { getSettings } from '../store/configStore';
import { sessionStore } from '../store/sessionStore';
import { DEFAULT_WORKSPACE } from '../store/persistence';
import { handleMessage, handleSdkSessionId, MessageContext, ResultData } from './messageHandler';
import { permissionManager } from './permissionManager';
import { shouldUpdateTitle, generateTitle } from './titleService';

// ==================== 类型定义 ====================

export interface QueryParams {
  prompt: string;
  sessionId: string;
  sdkSessionId?: string;
  options?: QueryOptions;
}

interface QueryContext {
  sessionId: string;
  messageId: string;
  abortController: AbortController;
}

type CanUseToolResult =
  | { behavior: 'allow'; updatedInput: Record<string, unknown> }
  | { behavior: 'deny'; message: string };

// ==================== 活跃查询管理 ====================

const activeQueries = new Map<string, AsyncGenerator<unknown, void, unknown>>();

// ==================== 路径解析 ====================

/**
 * 解析 Claude Code CLI 路径
 * 支持打包后和开发环境
 */
function resolveClaudeCodeCli(): string {
  const appPath = app.getAppPath();

  // 打包后的环境（路径包含 app.asar）
  if (appPath.includes('app.asar')) {
    const unpackedPath = join(
      appPath.replace('app.asar', 'app.asar.unpacked'),
      'node_modules',
      '@anthropic-ai',
      'claude-agent-sdk',
      'cli.js'
    );
    if (existsSync(unpackedPath)) {
      return unpackedPath;
    }
  }

  // 开发环境：直接在 node_modules 中查找
  const devPath = join(appPath, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js');
  if (existsSync(devPath)) {
    return devPath;
  }

  // 备选：从当前目录的 node_modules 查找
  const cwdPath = join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js');
  if (existsSync(cwdPath)) {
    return cwdPath;
  }

  throw new Error('Could not find claude-agent-sdk CLI');
}

/**
 * 确保 PATH 环境变量包含常见的 Node.js 安装路径
 * macOS GUI 应用不会继承终端的 PATH
 */
function ensureNodeInPath(): void {
  const currentPath = process.env.PATH || '';

  const nodePaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/usr/local/opt/node/bin',
    '/opt/homebrew/opt/node/bin',
    `${process.env.HOME}/.nvm/current/bin`,
    `${process.env.HOME}/.volta/bin`,
    `${process.env.HOME}/.fnm/current/bin`,
    '/usr/bin',
  ];

  const pathsToAdd = nodePaths.filter(p => !currentPath.includes(p) && existsSync(p));

  if (pathsToAdd.length > 0) {
    process.env.PATH = [...pathsToAdd, currentPath].join(':');
  }
}

/**
 * 创建工具权限回调
 */
function createCanUseTool(sessionId: string) {
  return async (
    toolName: string,
    input: Record<string, unknown>
  ): Promise<CanUseToolResult> => {
    // 特殊处理 AskUserQuestion 工具
    if (toolName === 'AskUserQuestion') {
      const questionInput = input as unknown as AskUserQuestionInput;
      const response = await permissionManager.requestUserQuestion(
        sessionId,
        questionInput.questions
      );

      return {
        behavior: 'allow',
        updatedInput: {
          questions: response.questions,
          answers: response.answers,
        },
      };
    }

    // 请求用户权限（其他工具）
    const result = await permissionManager.requestPermission(sessionId, toolName, input);

    if (result.behavior === 'allow') {
      return { behavior: 'allow', updatedInput: result.updatedInput };
    } else {
      return { behavior: 'deny', message: result.message };
    }
  };
}

/**
 * 构建查询选项
 */
function buildQueryOptions(
  settings: Settings,
  sessionId: string,
  sdkSessionId: string | undefined,
  abortController: AbortController,
  workspace?: string,
  queryOptions?: QueryOptions
): Record<string, unknown> {
  const agent = settings.agent;

  // 临时权限模式优先于全局设置
  const permissionMode = queryOptions?.permissionMode ?? agent.permissionMode ?? 'default';

  const options: Record<string, unknown> = {
    // 基础配置
    settingSources: ['user', 'project'],
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: agent.systemPrompt,
    },

    // 执行控制
    maxTurns: agent.maxTurns ?? 50,
    maxThinkingTokens: agent.maxThinkingTokens ?? 10000,
    abortController,
    pathToClaudeCodeExecutable: resolveClaudeCodeCli(),

    // 工作空间
    cwd: workspace || DEFAULT_WORKSPACE,

    // 消息处理
    includePartialMessages: true,

    // 权限
    canUseTool: createCanUseTool(sessionId),
    permissionMode,
  };

  // 会话恢复
  if (sdkSessionId) {
    options.resume = sdkSessionId;
  }

  // 工具配置
  if (agent.tools && agent.tools.length > 0) {
    options.tools = agent.tools;
  }
  if (agent.allowedTools && agent.allowedTools.length > 0) {
    options.allowedTools = agent.allowedTools;
  }

  return options;
}

// ==================== 消息管理 ====================

/**
 * 初始化查询消息
 * 创建用户消息和助手消息占位符
 */
function initializeMessages(sessionId: string, prompt: string): string {
  // 添加用户消息
  const userMessage: Message = {
    id: uuidv4(),
    role: 'user',
    content: prompt,
    timestamp: new Date().toISOString(),
  };
  sessionStore.addMessage(sessionId, userMessage);

  // 创建助手消息占位符
  const assistantMessageId = uuidv4();
  const assistantMessage: Message = {
    id: assistantMessageId,
    role: 'assistant',
    content: '',
    contentBlocks: [],
    timestamp: new Date().toISOString(),
    isStreaming: true,
  };
  sessionStore.addMessage(sessionId, assistantMessage);

  return assistantMessageId;
}

/**
 * 设置查询状态
 */
function setupQueryState(ctx: QueryContext): void {
  sessionStore.setQueryState(ctx.sessionId, {
    sessionId: ctx.sessionId,
    messageId: ctx.messageId,
    isStreaming: true,
    abortController: ctx.abortController,
  });
}

// ==================== 流处理 ====================

/**
 * 处理流式响应
 */
async function processStream(
  queryInstance: AsyncGenerator<unknown, void, unknown>,
  ctx: MessageContext,
  abortController: AbortController
): Promise<void> {
  let sdkSessionIdSent = false;

  for await (const message of queryInstance) {
    if (abortController.signal.aborted) {
      break;
    }

    const sdkMessage = message as SDKMessage;

    // 捕获 SDK session_id（只处理一次）
    if (!sdkSessionIdSent) {
      sdkSessionIdSent = handleSdkSessionId(sdkMessage, ctx.sessionId);
    }

    // 使用统一的消息处理器
    const result = handleMessage(sdkMessage, ctx);

    // 处理完成结果
    if (result.type === 'complete' && result.data) {
      await handleQueryComplete(ctx.sessionId, result.data);
    }
  }
}

/**
 * 处理查询完成
 */
async function handleQueryComplete(
  sessionId: string,
  data: ResultData
): Promise<void> {
  // 立即保存
  await sessionStore.saveNow(sessionId);

  // 发送完成事件
  sessionStore.emit('query:complete', sessionId, data);

  // 异步更新标题（不阻塞主流程）
  if (shouldUpdateTitle(sessionId)) {
    generateTitle(sessionId).catch(err => {
      console.error('Failed to generate title:', err);
    });
  }
}

// ==================== 主入口 ====================

/**
 * 执行 Agent 查询
 */
export async function executeQuery(params: QueryParams): Promise<void> {
  const { prompt, sessionId, sdkSessionId, options } = params;

  // 环境准备
  ensureNodeInPath();

  // 中断已有查询
  if (activeQueries.has(sessionId)) {
    await interruptQuery(sessionId);
  }

  // 加载配置
  const settings = await getSettings();
  const abortController = new AbortController();

  // 获取会话的工作空间
  const session = sessionStore.getSession(sessionId);
  const workspace = session?.workspace || DEFAULT_WORKSPACE;

  // 初始化消息
  const messageId = initializeMessages(sessionId, prompt);
  const ctx: QueryContext = { sessionId, messageId, abortController };

  // 设置查询状态
  setupQueryState(ctx);

  try {
    // 构建查询选项（传入临时 options）
    const queryOptions = buildQueryOptions(settings, sessionId, sdkSessionId, abortController, workspace, options);

    // 创建并注册查询实例
    const queryInstance = query({ prompt, options: queryOptions });
    activeQueries.set(sessionId, queryInstance);

    // 处理流式响应
    await processStream(queryInstance, { sessionId, messageId }, abortController);
  } catch (error) {
    console.error('Query error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sessionStore.emit('query:error', sessionId, errorMessage);
    throw error;
  } finally {
    activeQueries.delete(sessionId);
    sessionStore.clearQueryState(sessionId);
  }
}

// ==================== 查询控制 ====================

/**
 * 中断指定会话的查询
 */
export async function interruptQuery(sessionId: string): Promise<void> {
  const queryState = sessionStore.getQueryState(sessionId);

  // 取消待处理的权限请求和问题请求
  permissionManager.cancelSessionRequests(sessionId);
  permissionManager.cancelSessionQuestions(sessionId);

  // 中止控制器
  if (queryState?.abortController) {
    queryState.abortController.abort();
  }

  // 尝试调用查询实例的 interrupt 方法
  const queryInstance = activeQueries.get(sessionId);
  if (queryInstance) {
    try {
      const queryObj = queryInstance as unknown as { interrupt?: () => Promise<void> };
      if (typeof queryObj.interrupt === 'function') {
        await queryObj.interrupt();
      }
    } catch {
      // 忽略中断错误
    }
    activeQueries.delete(sessionId);
  }

  // 添加中断标记到消息
  if (queryState?.messageId) {
    sessionStore.appendToMessage(sessionId, queryState.messageId, 'text', '\n\n[已中断]');
    sessionStore.updateMessage(sessionId, queryState.messageId, {
      isStreaming: false,
    });
    await sessionStore.saveNow(sessionId);
  }

  sessionStore.clearQueryState(sessionId);
}

/**
 * 检查指定会话是否有活跃的查询
 */
export function hasActiveQuery(sessionId: string): boolean {
  return activeQueries.has(sessionId);
}
