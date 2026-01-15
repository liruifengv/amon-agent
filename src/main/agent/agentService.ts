import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { homedir } from 'os';
import { SDKMessage, Message, AskUserQuestionInput, QueryParams, PermissionResult, QueryOptions } from '../../shared/types';
import { Settings } from '../../shared/schemas';
import { DEFAULT_MAX_THINKING_TOKENS, COMMAND_TIMEOUT_MS } from '../../shared/constants';
import { getSettings } from '../store/configStore';
import { sessionStore } from '../store/sessionStore';
import { DEFAULT_WORKSPACE } from '../store/persistence';
import { handleMessage, handleSdkSessionId, MessageContext, ResultData } from './messageHandler';
import { permissionManager } from './permissionManager';
import { createLogger } from '../store/logger';
import { shouldUpdateTitle, generateTitle } from './titleService';
import { buildClaudeSessionEnv, getBundledBunPath, resolveClaudeCodeCli } from './config';

const log = createLogger('AgentService');

// ==================== 类型定义 ====================

interface QueryContext extends MessageContext {
  abortController: AbortController;
  workspace: string;
  settings: Settings;
}

// ==================== 活跃查询管理 ====================

const activeQueries = new Map<string, AsyncGenerator<unknown, void, unknown>>();

// ==================== 路径解析 ====================

/**
 * 展开路径中的 ~ 符号为用户主目录
 */
function expandTildePath(path: string): string {
  if (path.startsWith('~/') || path === '~') {
    return path.replace('~', homedir());
  }
  return path;
}


/**
 * 创建工具权限回调
 */
function createCanUseTool(sessionId: string) {
  return async (
    toolName: string,
    input: Record<string, unknown>
  ): Promise<PermissionResult> => {
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
): Options {
  const agent = settings.agent;

  // 临时权限模式优先于全局设置
  const permissionMode = queryOptions?.permissionMode ?? agent.permissionMode ?? 'default';

  // 展开工作空间路径中的 ~ 符号
  const expandedWorkspace = expandTildePath(workspace || DEFAULT_WORKSPACE);

  // 使用统一的环境变量构建器，传入 settings 以支持 API 配置
  const env = buildClaudeSessionEnv(expandedWorkspace, settings);

  const options: Options = {
    // 基础配置
    settingSources: agent.claudeCodeMode ? ['user', 'project'] : ['project'],
    systemPrompt: agent.claudeCodeMode
      ? {
          type: 'preset',
          preset: 'claude_code',
          append: agent.systemPrompt,
        }
      : agent.systemPrompt || undefined,
    env,

    // 执行控制
    maxTurns: agent.maxTurns ?? 50,
    maxThinkingTokens: agent.maxThinkingTokens ?? DEFAULT_MAX_THINKING_TOKENS,
    abortController,
    pathToClaudeCodeExecutable: resolveClaudeCodeCli(),
    executable: "bun",

    // 工作空间
    cwd: expandedWorkspace,

    // 消息处理
    includePartialMessages: true,

    // 权限
    canUseTool: createCanUseTool(sessionId),
    permissionMode,

    // stderr 回调，捕获子进程的错误输出
    stderr: (data: string) => {
      log.warn('SDK stderr', { data }, sessionId);
    },
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
  ctx: QueryContext
): Promise<void> {
  let sdkSessionIdSent = false;

  for await (const message of queryInstance) {
    if (ctx.abortController.signal.aborted) {
      break;
    }

    const sdkMessage = message as SDKMessage;

    // 记录 stderr 输出（如果存在）
    const rawMessage = message as { stderr?: string };
    if (rawMessage.stderr) {
      log.warn('stderr output', { stderr: rawMessage.stderr }, ctx.sessionId);
    }

    // 捕获 SDK session_id（只处理一次）
    if (!sdkSessionIdSent) {
      sdkSessionIdSent = handleSdkSessionId(sdkMessage, ctx.sessionId);
    }

    // 使用统一的消息处理器
    const result = handleMessage(sdkMessage, ctx);

    // 处理完成结果
    if (result.type === 'complete' && result.data) {
      await handleQueryComplete(ctx.sessionId, result.data, ctx.workspace, ctx.settings);
    }
  }
}

/**
 * 处理查询完成
 */
async function handleQueryComplete(
  sessionId: string,
  data: ResultData,
  workspace: string,
  settings: Settings
): Promise<void> {
  log.info('Query complete', { success: data.success, cost: data.cost, duration: data.duration }, sessionId);

  // 立即保存
  await sessionStore.saveNow(sessionId);

  // 发送完成事件
  sessionStore.emit('query:complete', sessionId, data);

  // 异步更新标题（不阻塞主流程）
  if (shouldUpdateTitle(sessionId)) {
    log.debug('Triggering title generation', undefined, sessionId);
    generateTitle(sessionId, workspace, settings).catch(err => {
      log.error('Failed to generate title', err instanceof Error ? { message: err.message } : err, sessionId);
    });
  }
}

// ==================== 主入口 ====================

/**
 * 执行 Agent 查询
 */
export async function executeQuery(params: QueryParams): Promise<void> {
  const { prompt, sessionId, sdkSessionId, options } = params;

  log.info('Query started', { promptLength: prompt.length, sdkSessionId: !!sdkSessionId, options }, sessionId);

  // 中断已有查询
  if (activeQueries.has(sessionId)) {
    log.info('Interrupting existing query', undefined, sessionId);
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
  const ctx: QueryContext = { sessionId, messageId, abortController, workspace, settings };

  // 设置查询状态
  setupQueryState(ctx);

  try {
    // 构建查询选项（传入临时 options）
    const queryOptions = buildQueryOptions(settings, sessionId, sdkSessionId, abortController, workspace, options);

    log.debug('Query options built', {
      workspace,
      permissionMode: queryOptions.permissionMode,
      cliPath: queryOptions.pathToClaudeCodeExecutable,
      executable: queryOptions.executable,
      envPath: (queryOptions.env as Record<string, string>)?.PATH?.substring(0, 200) + '...',
    }, sessionId);

    // 预检查：测试 bun 和 CLI 是否可以在目标工作目录中运行
    try {
      const bunPath = getBundledBunPath();
      const cliPath = queryOptions.pathToClaudeCodeExecutable as string;
      const env = queryOptions.env as Record<string, string>;
      const cwd = queryOptions.cwd as string;

      log.debug('Pre-check: testing bun execution', { bunPath, cliPath, cwd }, sessionId);

      const result = execSync(`"${bunPath}" "${cliPath}" --version`, {
        cwd,
        env: { ...env },
        encoding: 'utf-8',
        timeout: COMMAND_TIMEOUT_MS,
      });
      log.debug('Pre-check passed', { result: result.trim() }, sessionId);
    } catch (preCheckError) {
      const err = preCheckError as { message?: string; stderr?: string; stdout?: string; status?: number };
      log.error('Pre-check failed', {
        message: err.message,
        stderr: err.stderr,
        stdout: err.stdout,
        status: err.status,
      }, sessionId);

      // 检测 macOS 权限错误
      const errorMessage = err.message || err.stderr || '';
      if (errorMessage.includes('Operation not permitted') || errorMessage.includes('getcwd: cannot access parent directories')) {
        const permissionError = new Error(
          `无法访问工作空间目录: ${workspace}\n\n` +
          `这是 macOS 权限限制。请在「系统设置 > 隐私与安全性 > 完全磁盘访问权限」中添加 Amon 应用，然后重启应用。`
        );
        permissionError.name = 'PermissionError';
        throw permissionError;
      }
    }

    // 创建并注册查询实例
    const queryInstance = query({ prompt, options: queryOptions });
    activeQueries.set(sessionId, queryInstance);

    log.info('Query instance created, processing stream', undefined, sessionId);

    // 处理流式响应
    await processStream(queryInstance, ctx);

    log.info('Query completed successfully', undefined, sessionId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sessionStore.emit('query:error', sessionId, errorMessage);
    log.error('Query failed', errorMessage, sessionId);
    throw error;
  } finally {
    activeQueries.delete(sessionId);
    sessionStore.clearQueryState(sessionId);
    log.debug('Query state cleared', undefined, sessionId);
  }
}

// ==================== 查询控制 ====================

/**
 * 中断指定会话的查询
 */
export async function interruptQuery(sessionId: string): Promise<void> {
  log.info('Interrupt requested', undefined, sessionId);
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
  log.info('Query interrupted', undefined, sessionId);
}

/**
 * 检查指定会话是否有活跃的查询
 */
export function hasActiveQuery(sessionId: string): boolean {
  return activeQueries.has(sessionId);
}
