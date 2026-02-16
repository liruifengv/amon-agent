import { Agent } from '@mariozechner/pi-agent-core';
import { streamSimple } from '@mariozechner/pi-ai';
import { homedir } from 'os';
import type { AgentSettings } from '../../shared/schemas';
import type { Message } from '../../shared/types';
import { createTools } from './tools/index';
import { buildAmonSystemPrompt } from './systemPrompt';
import { modelManager } from './modelManager';
import { convertAmonToPiMessages } from './messageConverter';
import { createLogger } from '../store/logger';

const log = createLogger('AgentCache');

// ==================== Agent 实例缓存 ====================

const agents = new Map<string, Agent>();

// ==================== 路径解析 ====================

/**
 * 展开路径中的 ~ 符号为用户主目录
 */
export function expandTildePath(path: string): string {
  if (path.startsWith('~/') || path === '~') {
    return path.replace('~', homedir());
  }
  return path;
}

// ==================== Agent 管理 ====================

/**
 * 获取或创建指定会话的 Agent 实例
 */
export function getOrCreateAgent(
  sessionId: string,
  agentSettings: AgentSettings,
  cwd: string,
): Agent {
  let agent = agents.get(sessionId);
  if (agent) {
    // 动态更新模型和 thinking level（用户可能在设置中切换了）
    const model = modelManager.getActiveModel(agentSettings);
    if (model) {
      agent.setModel(model);
    }
    agent.setThinkingLevel(agentSettings.thinkingLevel || 'medium');
    return agent;
  }

  const model = modelManager.getActiveModel(agentSettings);
  if (!model) {
    throw new Error(
      `No model found for provider "${agentSettings.activeProvider}" and model "${agentSettings.activeModelId}". ` +
      `Please check your settings.`
    );
  }

  const tools = createTools(cwd);

  agent = new Agent({
    initialState: {
      systemPrompt: buildAmonSystemPrompt({
        cwd,
        tools: tools.map((t: { name: string }) => t.name),
        customPrompt: agentSettings.systemPrompt,
      }),
      model,
      thinkingLevel: agentSettings.thinkingLevel || 'medium',
      tools,
    },
    getApiKey: async (provider: string) => {
      return modelManager.getApiKey(provider, agentSettings);
    },
    streamFn: streamSimple,
  });

  agents.set(sessionId, agent);
  return agent;
}

/**
 * 获取指定会话的 Agent 实例（不创建）
 */
export function getAgent(sessionId: string): Agent | undefined {
  return agents.get(sessionId);
}

/**
 * 恢复 Agent 的会话上下文（从 Amon 消息历史）
 */
export function restoreAgentContext(agent: Agent, messages: Message[]): void {
  const piMessages = convertAmonToPiMessages(messages);
  agent.replaceMessages(piMessages);
}

/**
 * 删除会话时清理 Agent 实例
 */
export function deleteSessionAgent(sessionId: string): void {
  const agent = agents.get(sessionId);
  if (agent) {
    if (agent.state.isStreaming) {
      agent.abort();
    }
    agents.delete(sessionId);
    log.info('Agent instance removed', undefined, sessionId);
  }
}

/**
 * 清理所有 Agent 实例（应用退出时调用）
 */
export function cleanupAllAgents(): void {
  for (const [, agent] of agents) {
    if (agent.state.isStreaming) {
      agent.abort();
    }
  }
  agents.clear();
  log.info('All agent instances cleaned up');
}
