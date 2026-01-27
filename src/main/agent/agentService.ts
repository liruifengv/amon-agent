import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { homedir } from 'os';
import { SDKMessage, Message, AskUserQuestionInput, MessageParams, PermissionResult, MessageOptions, ImageAttachment } from '../../shared/types';
import { Settings } from '../../shared/schemas';
import { DEFAULT_MAX_THINKING_TOKENS, COMMAND_TIMEOUT_MS } from '../../shared/constants';
import { getSettings } from '../store/configStore';
import { sessionStore } from '../store/sessionStore';
import { DEFAULT_WORKSPACE } from '../store/persistence';
import { handleMessage, handleSdkSessionId, MessageContext, ResultData } from './messageHandler';
import { StreamState } from './streamState';
import { permissionManager } from './permissionManager';
import { createLogger } from '../store/logger';
import { buildClaudeSessionEnv, getBundledBunPath, resolveClaudeCodeCli } from './config';

const log = createLogger('AgentService');

// ==================== 类型定义 ====================

interface SendMessageContext extends MessageContext {
  abortController: AbortController;
  workspace: string;
  settings: Settings;
}

// ==================== 活跃消息管理 ====================

const activeMessages = new Map<string, AsyncGenerator<unknown, void, unknown>>();

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

    // 特殊处理 ExitPlanMode 工具
    if (toolName === 'ExitPlanMode') {
      const plan = String(input.plan || '');
      const response = await permissionManager.requestPlanApproval(
        sessionId,
        plan
      );

      if (response.approved) {
        return {
          behavior: 'allow',
          updatedInput: {
            plan,
            approved: true,
            message: response.message,
          },
        };
      } else {
        return {
          behavior: 'deny',
          message: response.message || 'User rejected the plan',
        };
      }
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
  messageOptions?: MessageOptions
): Options {
  const agent = settings.agent;

  // 临时权限模式优先于全局设置
  const permissionMode = messageOptions?.permissionMode ?? agent.permissionMode ?? 'default';

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
 * 设置会话标题（使用第一条用户消息）
 */
function setTitleFromFirstMessage(sessionId: string, prompt: string): void {
  const session = sessionStore.getSession(sessionId);
  if (!session || session.messages.filter(m => m.role === 'user').length > 1) return;

  // 截断到合理长度（50字符）
  const title = prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt;
  sessionStore.renameSession(sessionId, title);
}

/**
 * 初始化查询消息
 * 创建用户消息和助手消息占位符
 */
function initializeMessages(sessionId: string, prompt: string, images?: ImageAttachment[]): string {
  // 添加用户消息
  const userMessage: Message = {
    id: uuidv4(),
    role: 'user',
    content: prompt,
    images, // 保存图片到用户消息
    timestamp: new Date().toISOString(),
  };
  sessionStore.addMessage(sessionId, userMessage);

  // 设置会话标题
  setTitleFromFirstMessage(sessionId, prompt);

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
 * 设置消息状态
 */
function setupMessageState(ctx: SendMessageContext): void {
  sessionStore.setMessageState(ctx.sessionId, {
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
  ctx: SendMessageContext
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
      await handleMessageComplete(ctx.sessionId, result.data);
    }
  }
}

/**
 * 处理消息完成
 */
async function handleMessageComplete(
  sessionId: string,
  data: ResultData
): Promise<void> {
  log.info('Message complete', { success: data.success, cost: data.cost, duration: data.duration }, sessionId);

  // 立即保存
  await sessionStore.saveNow(sessionId);

  // 发送完成事件
  sessionStore.emit('message:complete', sessionId, data);
}

// ==================== 主入口 ====================

/**
 * 发送消息到 Agent
 */
export async function sendMessage(params: MessageParams): Promise<void> {
  const { prompt, sessionId, sdkSessionId, options, images } = params;

  log.info('Message started', { promptLength: prompt.length, imageCount: images?.length ?? 0, sdkSessionId: !!sdkSessionId, options }, sessionId);

  // 中断已有消息处理
  if (activeMessages.has(sessionId)) {
    log.info('Interrupting existing message', undefined, sessionId);
    await interruptMessage(sessionId);
  }

  // 加载配置
  const settings = await getSettings();
  const abortController = new AbortController();

  // 获取会话的工作空间
  const session = sessionStore.getSession(sessionId);
  const workspace = session?.workspace || DEFAULT_WORKSPACE;

  // 初始化消息
  const messageId = initializeMessages(sessionId, prompt, images);

  // 创建流式状态管理器
  const streamState = new StreamState(sessionId);

  const ctx: SendMessageContext = { sessionId, messageId, streamState, abortController, workspace, settings };

  // 设置消息状态
  setupMessageState(ctx);

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

    // 创建并注册消息实例
    // 构建 prompt：如果有图片，使用多模态格式
    let queryPrompt: string | Parameters<typeof query>[0]['prompt'];

    if (images && images.length > 0) {
      // 构建多模态内容数组
      const contentBlocks: Array<
        | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
        | { type: 'text'; text: string }
      > = [];

      // 先添加图片（Claude 建议图片放在文本前面）
      for (const img of images) {
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mimeType,
            data: img.base64Data,
          },
        });
      }

      // 再添加文本
      if (prompt) {
        contentBlocks.push({
          type: 'text',
          text: prompt,
        });
      }

      // 使用 AsyncIterable 格式传递多模态消息
      queryPrompt = (async function* () {
        yield {
          type: 'user' as const,
          session_id: sessionId,
          message: {
            role: 'user' as const,
            content: contentBlocks,
          },
        };
      })();
    } else {
      queryPrompt = prompt;
    }

    const queryInstance = query({ prompt: queryPrompt, options: queryOptions });
    activeMessages.set(sessionId, queryInstance);

    log.info('Message instance created, processing stream', undefined, sessionId);

    // 处理流式响应
    await processStream(queryInstance, ctx);

    log.info('Message completed successfully', undefined, sessionId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sessionStore.emit('message:error', sessionId, errorMessage);
    log.error('Message failed', errorMessage, sessionId);
    throw error;
  } finally {
    activeMessages.delete(sessionId);
    sessionStore.clearMessageState(sessionId);
    log.debug('Message state cleared', undefined, sessionId);
  }
}

// ==================== 消息控制 ====================

/**
 * 中断指定会话的消息处理
 */
export async function interruptMessage(sessionId: string): Promise<void> {
  log.info('Interrupt requested', undefined, sessionId);
  const messageState = sessionStore.getMessageState(sessionId);

  // 取消待处理的权限请求和问题请求
  permissionManager.cancelSessionRequests(sessionId);
  permissionManager.cancelSessionQuestions(sessionId);
  permissionManager.cancelSessionPlanApprovals(sessionId);

  // 中止控制器
  if (messageState?.abortController) {
    messageState.abortController.abort();
  }

  // 尝试调用消息实例的 interrupt 方法
  const queryInstance = activeMessages.get(sessionId);
  if (queryInstance) {
    try {
      const queryObj = queryInstance as unknown as { interrupt?: () => Promise<void> };
      if (typeof queryObj.interrupt === 'function') {
        await queryObj.interrupt();
      }
    } catch {
      // 忽略中断错误
    }
    activeMessages.delete(sessionId);
  }

  // 添加中断标记到消息
  if (messageState?.messageId) {
    sessionStore.appendToMessage(sessionId, messageState.messageId, 'text', '\n\n[已中断]');
    sessionStore.updateMessage(sessionId, messageState.messageId, {
      isStreaming: false,
    });
    await sessionStore.saveNow(sessionId);
  }

  sessionStore.clearMessageState(sessionId);
  log.info('Message interrupted', undefined, sessionId);
}

/**
 * 检查指定会话是否有活跃的消息处理
 */
export function hasActiveMessage(sessionId: string): boolean {
  return activeMessages.has(sessionId);
}
