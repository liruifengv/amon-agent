import { Agent } from '../../agent';
import type { AgentEvent, AgentMessage, AgentTool } from '../../agent';
import {
  getModels,
  type Model,
  type ImageContent,
  type TextContent,
  type UserMessage,
  type Message,
} from '../../ai';
import type { ToolRegistry } from '../tools/tool-registry';
import type { Tool } from '../tools/types';
import type { SessionStore } from '../store/session-store';
import type { Persistence } from '../store/persistence';
import type { ConfigStore } from '../store/config-store';
import type { SkillsStore } from '../skills';
import type { EventAdapter } from './event-adapter';
import type { PushService } from '../ipc/push';
import type { ProviderConfig } from '@shared/schemas';
import type { ImageAttachment } from '@shared/types';
import { buildSystemPrompt } from './system-prompt';
import { loadGlobalUserFiles, loadProjectAgentsFile } from '../workspace';
import { formatSkillsForPrompt } from '../skills';

// ==================== Types ====================

interface AgentServiceDeps {
  sessionStore: SessionStore;
  persistence: Persistence;
  configStore: ConfigStore;
  toolRegistry: ToolRegistry;
  skillsStore: SkillsStore;
  eventAdapter: EventAdapter;
  pushService: PushService;
  dataDir: string;
  defaultWorkspace: string;
}

// ==================== Model Resolution ====================

function resolveModel(config: ProviderConfig): Model<any> {
  // getModels expects a builtin provider key; cast is safe — returns empty array for unknowns
  const builtinModels = getModels(config.provider as any);
  const match = builtinModels?.find((m) => m.id === config.modelId);
  if (match) {
    return config.baseUrl ? { ...match, baseUrl: config.baseUrl } : match;
  }
  // Custom model fallback
  return {
    id: config.modelId,
    name: config.modelId,
    api: config.apiType,
    provider: config.provider,
    baseUrl: config.baseUrl ?? '',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  } satisfies Model<any>;
}

// ==================== Tool Wrapping ====================

function wrapTool(tool: Tool<any>): AgentTool {
  return {
    name: tool.name,
    description: tool.description,
    label: tool.name,
    inputSchema: tool.inputSchema,
    execute: async (toolCallId, input, ctx) => {
      const result = await tool.execute(input, {
        cwd: ctx.cwd,
        signal: ctx.signal ?? new AbortController().signal,
      });
      return {
        content: [{ type: 'text', text: result.output }],
        details: { output: result.output, isError: result.isError },
      };
    },
  };
}

// ==================== AgentService ====================

export class AgentService {
  private agents = new Map<string, Agent>();

  constructor(private deps: AgentServiceDeps) {}

  async sendMessage(
    sessionId: string,
    prompt: string,
    images?: ImageAttachment[],
  ): Promise<void> {
    // Abort any existing run for this session
    this.abort(sessionId);

    const { sessionStore, persistence, configStore, toolRegistry, skillsStore, eventAdapter, pushService, dataDir, defaultWorkspace } = this.deps;

    const session = sessionStore.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    // Auto-set title from first user message if still default
    if (session.title === 'New Session') {
      const maxLen = 50;
      const firstLine = prompt.split('\n')[0].trim();
      const title = firstLine.length > maxLen ? firstLine.slice(0, maxLen) + '...' : firstLine;
      if (title) {
        sessionStore.renameSession(sessionId, title);
        await persistence.appendMetaUpdate(sessionId, { title });
      }
    }

    const settings = await configStore.getSettings();
    const agentSettings = settings.agent;

    // Resolve active provider config
    const providerConfig = agentSettings.providerConfigs.find(
      (c) => c.id === agentSettings.activeProviderId,
    );
    if (!providerConfig) {
      throw new Error(
        `Provider "${agentSettings.activeProviderId}" not found. Please check your settings.`,
      );
    }

    // Resolve model
    const model = resolveModel(providerConfig);

    // Load skills
    await skillsStore.load(session.workspace);
    const disabledSkills = settings.skills?.disabledSkills ?? [];
    const skillsPrompt = formatSkillsForPrompt(skillsStore.getSkills(), disabledSkills);

    // Load user files
    const globalUserFiles = await loadGlobalUserFiles(dataDir);
    const projectAgentsFile = await loadProjectAgentsFile(session.workspace, defaultWorkspace);

    // Build system prompt
    const systemPrompt = buildSystemPrompt({
      workspace: session.workspace,
      tools: toolRegistry.getAll(),
      skillsPrompt,
      globalUserFiles,
      projectAgentsFile: projectAgentsFile ?? undefined,
    });

    // Get or create Agent instance
    const agent = this.getOrCreateAgent(sessionId);

    // Configure agent
    agent.setSystemPrompt(systemPrompt);
    agent.setModel(model);
    agent.setThinkingLevel(
      agentSettings.thinkingLevel === 'off' ? 'off' : agentSettings.thinkingLevel,
    );
    agent.setTools(toolRegistry.getAll().map(wrapTool));
    agent.getApiKey = () => providerConfig.apiKey || undefined;
    agent.sessionId = sessionId;
    agent.cwd = session.workspace;

    // Restore messages from SessionStore into Agent
    const existingMessages = sessionStore.getMessages(sessionId);
    if (existingMessages.length > 0 && agent.state.messages.length === 0) {
      agent.replaceMessages(existingMessages);
    }

    // Wire event adapter
    const unsubscribe = agent.subscribe((event: AgentEvent) => {
      eventAdapter.handleEvent(sessionId, event);
    });

    // Notify UI: agent running
    pushService.pushAgentState(sessionId, { isRunning: true, toolExecutions: {}, contextWindow: model.contextWindow });

    try {
      // Build user message (ai format)
      const content: (TextContent | ImageContent)[] = [{ type: 'text', text: prompt }];
      if (images && images.length > 0) {
        for (const img of images) {
          content.push({
            type: 'image',
            data: img.base64Data,
            mimeType: img.mimeType,
          });
        }
      }
      const userMessage: UserMessage = {
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      await agent.prompt(userMessage);
    } finally {
      unsubscribe();

      // Notify UI: agent stopped
      pushService.pushAgentState(sessionId, { isRunning: false, toolExecutions: {}, contextWindow: model.contextWindow });

      // Persist all messages
      await this.persistMessages(sessionId);
    }
  }

  abort(sessionId: string): void {
    this.agents.get(sessionId)?.abort();
  }

  removeAgent(sessionId: string): void {
    this.agents.get(sessionId)?.abort();
    this.agents.delete(sessionId);
  }

  restoreFromMessages(sessionId: string, messages: Message[]): void {
    const agent = this.getOrCreateAgent(sessionId);
    agent.replaceMessages(messages);
  }

  private getOrCreateAgent(sessionId: string): Agent {
    let agent = this.agents.get(sessionId);
    if (!agent) {
      agent = new Agent({
        convertToLlm: defaultConvertToLlm,
      });
      this.agents.set(sessionId, agent);
    }
    return agent;
  }

  private async persistMessages(sessionId: string): Promise<void> {
    const messages = this.deps.sessionStore.getMessages(sessionId);
    // Rewrite the full message array to disk (replaces old messages)
    if (messages.length > 0) {
      await this.deps.persistence.rewriteMessages(sessionId, messages);
    }
  }
}

/**
 * Default convertToLlm: filter to LLM-compatible message roles only.
 */
function defaultConvertToLlm(messages: AgentMessage[]): Message[] {
  return messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant' || m.role === 'toolResult',
  );
}
