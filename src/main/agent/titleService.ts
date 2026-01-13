import { query } from '@anthropic-ai/claude-agent-sdk';
import { app } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';
import { sessionStore } from '../store/sessionStore';
import { Message, SDKMessage } from '../../shared/types';
import { createLogger } from '../store/logger';

const log = createLogger('TitleService');

const DEFAULT_TITLE_PREFIX = '新会话';

// 记录每个会话上次更新标题时的用户消息数
const lastTitleUpdateCount: Map<string, number> = new Map();

function resolveClaudeCodeCli(): string {
  const appPath = app.getAppPath();

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

  const devPath = join(appPath, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js');
  if (existsSync(devPath)) {
    return devPath;
  }

  const cwdPath = join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js');
  if (existsSync(cwdPath)) {
    return cwdPath;
  }

  throw new Error('Could not find claude-agent-sdk CLI');
}

/**
 * 检查会话是否需要更新标题
 */
export function shouldUpdateTitle(sessionId: string): boolean {
  const session = sessionStore.getSession(sessionId);
  if (!session) return false;

  const messages = session.messages;
  const userMessageCount = messages.filter(m => m.role === 'user').length;

  // 第一次对话后生成标题（当标题还是默认的时候）
  if (session.name.startsWith(DEFAULT_TITLE_PREFIX) && userMessageCount >= 1) {
    return true;
  }

  // 每 10 次对话更新一次标题
  const lastCount = lastTitleUpdateCount.get(sessionId) || 0;
  if (userMessageCount > 0 && userMessageCount % 10 === 0 && userMessageCount !== lastCount) {
    return true;
  }

  return false;
}

/**
 * 使用 AI 生成会话标题
 */
export async function generateTitle(sessionId: string): Promise<void> {
  log.info('Generating title', undefined, sessionId);

  const session = sessionStore.getSession(sessionId);
  if (!session) return;

  const messages = session.messages;
  if (messages.length === 0) return;

  const userMessageCount = messages.filter(m => m.role === 'user').length;

  // 构建对话摘要
  const recentMessages = messages.slice(-10);
  const conversationSummary = formatMessagesForTitleGeneration(recentMessages);

  const prompt = `根据以下对话内容，生成一个简短的标题（不超过15个字符，不要使用引号，直接输出标题内容）：

${conversationSummary}

标题：`;

  try {
    // 环境变量由 SDK 自动从系统环境读取
    const queryInstance = query({
      prompt,
      options: {
        settingSources: ['user'],
        maxTurns: 1,
        allowedTools: [],
        pathToClaudeCodeExecutable: resolveClaudeCodeCli(),
      },
    });

    let title = '';

    for await (const message of queryInstance) {
      const sdkMessage = message as SDKMessage;

      // 从 result 消息中提取结果
      if (sdkMessage.type === 'result' && sdkMessage.result) {
        title = sdkMessage.result;
        break;
      }
    }

    if (title) {
      // 清理标题
      title = title.trim();
      title = title.replace(/^["'""'']+|["'""'']+$/g, '');
      title = title.replace(/\n/g, ' ').trim();

      if (title.length > 20) {
        title = title.substring(0, 20);
      }

      if (title) {
        await sessionStore.renameSession(sessionId, title);
        lastTitleUpdateCount.set(sessionId, userMessageCount);
        log.info('Title generated', { title }, sessionId);
      }
    }
  } catch (error) {
    log.error('Failed to generate title', error instanceof Error ? { message: error.message } : error, sessionId);
  }
}

/**
 * 格式化消息用于标题生成
 */
function formatMessagesForTitleGeneration(messages: Message[]): string {
  return messages
    .map(m => {
      const role = m.role === 'user' ? '用户' : '助手';
      let content = m.content || '';

      if (m.contentBlocks && m.contentBlocks.length > 0) {
        const textBlocks = m.contentBlocks
          .filter(b => b.type === 'text')
          .map(b => b.content)
          .join('\n');
        if (textBlocks) {
          content = textBlocks;
        }
      }

      if (content.length > 200) {
        content = content.substring(0, 200) + '...';
      }

      return `${role}: ${content}`;
    })
    .join('\n\n');
}
