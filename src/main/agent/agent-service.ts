import { Agent } from '../../agent';
import type { AgentEvent, AgentMessage, AgentTool } from '../../agent';
import {
  isContextOverflow,
  type Model,
  type ImageContent,
  type TextContent,
  type UserMessage,
  type AssistantMessage,
  type Message,
} from '../../ai';
import type { ToolRegistry } from '../tools/tool-registry';
import type { Tool, ToolResult } from '../tools/types';
import type { SessionStore } from '../store/session-store';
import type { Persistence } from '../store/persistence';
import type { ConfigStore } from '../store/config-store';
import type { EventAdapter } from './event-adapter';
import type { PushService } from '../ipc/push';
import type { ConnectionAuthService } from '../auth';
import type { CompactionSettings } from '@shared/schemas';
import type { CompactionMessage, CompactionSnapshot, ImageAttachment, SessionMessage } from '@shared/types';
import type { ApprovalMode } from '@shared/permission-types';
import type { ResolvedRequestAuth } from '@shared/connection-auth';
import type { QuestionToolUpdate } from '@shared/question-types';
import { buildSystemPrompt } from './system-prompt';
import {
  CompactionService,
  getUsageContextTokensFromAssistant,
  toCompactionNotice,
} from './compaction-service';
import { loadGlobalUserFiles, loadProjectAgentsFile } from '../workspace';
import { ApprovalService } from '../permissions/approval-service';
import { PermissionedToolExecutor } from '../permissions/tool-executor';
import type { QuestionService } from '../questions/question-service';
import { resolveRuntimeModel } from './resolve-runtime-model';

// ==================== Types ====================

interface AgentServiceDeps {
  sessionStore: SessionStore;
  persistence: Persistence;
  configStore: ConfigStore;
  connectionAuthService: ConnectionAuthService;
  toolRegistry: ToolRegistry;
  eventAdapter: EventAdapter;
  pushService: PushService;
  approvalService: ApprovalService;
  questionService: QuestionService;
  dataDir: string;
  defaultWorkspace: string;
}

interface PendingCompactionRequest {
  source: 'auto-threshold' | 'auto-overflow';
  tokensBefore: number;
  triggerTimestamp: number;
}

// ==================== Tool Wrapping ====================

function buildToolDetails(result: ToolResult): Record<string, unknown> {
  if (result.details && typeof result.details === 'object' && !Array.isArray(result.details)) {
    return {
      ...(result.details as Record<string, unknown>),
      output: result.output,
      isError: result.isError,
    };
  }

  if (result.details !== undefined) {
    return {
      output: result.output,
      isError: result.isError,
      data: result.details,
    };
  }

  return {
    output: result.output,
    isError: result.isError,
  };
}

function wrapTool(
  tool: Tool<any>,
  options: {
    sessionId: string;
    defaultApprovalMode: ApprovalMode;
    toolExecutor: PermissionedToolExecutor;
  },
): AgentTool {
  return {
    name: tool.name,
    description: tool.description,
    label: tool.name,
    inputSchema: tool.inputSchema,
    execute: async (toolCallId, input, ctx) => {
      const toolContext = {
        sessionId: options.sessionId,
        toolCallId,
        cwd: ctx.cwd,
        signal: ctx.signal ?? new AbortController().signal,
        onQuestionUpdate: (update: QuestionToolUpdate) => {
          ctx.onUpdate?.({
            content: [],
            details: update,
          });
        },
      };

      const result = tool.name === 'AskUserQuestion'
        ? await tool.execute(input, toolContext)
        : await options.toolExecutor.execute(tool, input, {
          ...toolContext,
          mode: options.defaultApprovalMode,
          onPermissionUpdate: (update) => {
            ctx.onUpdate?.({
              content: [],
              details: update,
            });
          },
        });

      return {
        content: [{ type: 'text', text: result.output }],
        details: buildToolDetails(result),
      };
    },
  };
}

// ==================== AgentService ====================

export class AgentService {
  private agents = new Map<string, Agent>();
  private readonly toolExecutor: PermissionedToolExecutor;
  private readonly compactionService = new CompactionService();

  constructor(private deps: AgentServiceDeps) {
    this.toolExecutor = new PermissionedToolExecutor(
      deps.sessionStore,
      deps.approvalService,
    );
  }

  async sendMessage(
    sessionId: string,
    prompt: string,
    images?: ImageAttachment[],
  ): Promise<void> {
    // Abort any existing run for this session
    this.abort(sessionId);

    const { sessionStore, persistence, configStore, connectionAuthService, toolRegistry, eventAdapter, dataDir, defaultWorkspace } = this.deps;

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

    const activeConnectionId = agentSettings.activeConnectionId;
    if (!activeConnectionId) {
      throw new Error('No active connection configured. Please check your settings.');
    }

    const connection = agentSettings.connections.find(
      (item) => item.id === activeConnectionId,
    );
    if (!connection) {
      throw new Error(
        `Connection "${activeConnectionId}" not found. Please check your settings.`,
      );
    }

    const model = resolveRuntimeModel(connection);

    // Load user files
    const globalUserFiles = await loadGlobalUserFiles(dataDir);
    const projectAgentsFile = await loadProjectAgentsFile(session.workspace, defaultWorkspace);

    // Build system prompt
    const systemPrompt = buildSystemPrompt({
      workspace: session.workspace,
      tools: toolRegistry.getAll(),
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
    agent.setTools(toolRegistry.getAll().map((tool) => wrapTool(tool, {
      sessionId,
      defaultApprovalMode: session.approvalMode ?? agentSettings.defaultApprovalMode,
      toolExecutor: this.toolExecutor,
    })));
    const resolveRequestAuth = async (): Promise<ResolvedRequestAuth | undefined> => {
      return connectionAuthService.resolveRequestAuth(connection.id);
    };
    agent.getRequestAuth = async (): Promise<ResolvedRequestAuth | undefined> => resolveRequestAuth();
    agent.sessionId = sessionId;
    agent.cwd = session.workspace;

    let pendingCompaction: PendingCompactionRequest | null = null;

    agent.setShouldStopAfterTurn(async (turn) => {
      if (turn.message.role !== 'assistant') {
        return false;
      }

      const request = this.resolveAutomaticCompactionRequest({
        sessionId,
        model,
        compactionSettings: agentSettings.compaction,
        messages: turn.messages,
        lastAssistant: turn.message,
      });
      if (!request) {
        return false;
      }

      pendingCompaction = {
        ...request,
        triggerTimestamp: turn.message.timestamp,
      };
      return true;
    });

    // Restore messages from SessionStore into Agent
    const existingMessages = sessionStore.getMessages(sessionId);
    if (existingMessages.length > 0 && agent.state.messages.length === 0) {
      agent.replaceMessages(existingMessages as AgentMessage[]);
    }

    // Wire event adapter
    const unsubscribe = agent.subscribe((event: AgentEvent) => {
      if (
        event.type === 'turn_end'
        && pendingCompaction?.source === 'auto-overflow'
        && event.message.role === 'assistant'
        && event.message.timestamp === pendingCompaction.triggerTimestamp
      ) {
        this.pushAgentState(sessionId, true, model);
        return;
      }
      eventAdapter.handleEvent(sessionId, event);
      if (event.type === 'turn_end') {
        this.pushAgentState(sessionId, true, model);
      }
    });

    // Notify UI: agent running
    this.pushAgentState(sessionId, true, model);

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

      while (true) {
        const compactionRequest = pendingCompaction as PendingCompactionRequest | null;
        if (!compactionRequest) {
          break;
        }

        pendingCompaction = null;
        const snapshot = await this.applyCompaction({
          sessionId,
          model,
          source: compactionRequest.source,
          compactionSettings: agentSettings.compaction,
          messages: this.getAiMessagesForSession(sessionId),
          tokensBefore: compactionRequest.tokensBefore,
          getRequestAuth: async () => resolveRequestAuth(),
        });
        if (!snapshot) {
          break;
        }

        this.appendCompactionMessage(sessionId, agent, snapshot);
        this.pushAgentState(sessionId, true, model);
        await agent.continue();
      }
    } finally {
      agent.setShouldStopAfterTurn(undefined);
      unsubscribe();

      // Notify UI: agent stopped
      this.pushAgentState(sessionId, false, model);

      // Persist all messages
      await this.persistMessages(sessionId);
    }
  }

  abort(sessionId: string): void {
    this.deps.approvalService.rejectAllForSession(sessionId);
    this.deps.questionService.rejectAllForSession(sessionId);
    this.agents.get(sessionId)?.abort();
  }

  removeAgent(sessionId: string): void {
    this.agents.get(sessionId)?.abort();
    this.agents.delete(sessionId);
  }

  restoreFromMessages(sessionId: string, messages: SessionMessage[]): void {
    const agent = this.getOrCreateAgent(sessionId);
    agent.replaceMessages(messages as AgentMessage[]);
  }

  private getOrCreateAgent(sessionId: string): Agent {
    let agent = this.agents.get(sessionId);
    if (!agent) {
      agent = new Agent({
        convertToLlm: defaultConvertToLlm,
        transformContext: async (messages) => this.transformContextForSession(sessionId, messages),
      });
      this.agents.set(sessionId, agent);
    }
    return agent;
  }

  private pushAgentState(sessionId: string, isRunning: boolean, model: Model<any>): void {
    const messages = this.getAiMessagesForSession(sessionId);
    const lastAssistant = getLastAssistantMessage(messages);
    const snapshot = this.deps.sessionStore.getCompactionSnapshot(sessionId);
    this.deps.pushService.pushAgentState(sessionId, {
      isRunning,
      toolExecutions: {},
      contextWindow: model.contextWindow,
      contextTokens: this.resolveDisplayedContextTokens({
        messages,
        model,
        snapshot,
        lastAssistant,
      }),
      lastCompaction: snapshot ? toCompactionNotice(snapshot) : null,
    });
  }

  private resolveAutomaticCompactionRequest(options: {
    sessionId: string;
    model: Model<any>;
    compactionSettings: CompactionSettings;
    messages: AgentMessage[];
    lastAssistant: AssistantMessage;
  }): {
    source: 'auto-threshold' | 'auto-overflow';
    tokensBefore: number;
  } | null {
    if (!this.isAutomaticCompactionEnabled(options.compactionSettings)) {
      return null;
    }

    const source = isContextOverflow(options.lastAssistant, options.model.contextWindow)
      ? 'auto-overflow'
      : (
        this.compactionService.shouldCompactFromUsage(
          getUsageContextTokensFromAssistant(options.lastAssistant),
          options.model.contextWindow,
          options.compactionSettings.reserveTokens,
        )
          ? 'auto-threshold'
          : null
      );
    if (!source) {
      return null;
    }

    const snapshot = this.deps.sessionStore.getCompactionSnapshot(options.sessionId);
    return {
      source,
      tokensBefore: this.resolveContextTokenCountForMessages(
        defaultConvertToLlm(options.messages),
        snapshot,
        options.model.contextWindow,
        options.lastAssistant,
      ),
    };
  }

  private async applyCompaction(options: {
    sessionId: string;
    model: Model<any>;
    source: 'auto-threshold' | 'auto-overflow';
    compactionSettings: CompactionSettings;
    messages: Message[];
    tokensBefore: number;
    getRequestAuth: () => Promise<ResolvedRequestAuth | undefined>;
  }) {
    try {
      const result = await this.compactionService.compact({
        sessionId: options.sessionId,
        messages: options.messages,
        model: options.model,
        source: options.source,
        tokensBefore: options.tokensBefore,
        keepRecentTokens: options.compactionSettings.keepRecentTokens,
        snapshot: this.deps.sessionStore.getCompactionSnapshot(options.sessionId),
        getRequestAuth: async () => options.getRequestAuth(),
      });

      if (!result) {
        return null;
      }

      this.deps.sessionStore.setCompactionSnapshot(options.sessionId, result.snapshot);
      await this.deps.persistence.appendCompactionSnapshot(options.sessionId, result.snapshot);
      this.deps.pushService.pushCompaction(options.sessionId, result.notice);

      return result.snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.pushService.pushError(
        options.sessionId,
        `Conversation compaction failed: ${message}`,
      );
      return null;
    }
  }

  private appendCompactionMessage(sessionId: string, agent: Agent, snapshot: CompactionSnapshot): void {
    const message: CompactionMessage = {
      role: 'compaction',
      source: snapshot.source,
      tokensBefore: snapshot.tokensBefore,
      tokensAfter: snapshot.tokensAfter,
      timestamp: snapshot.createdAt,
    };

    agent.appendMessage(message);
    this.deps.sessionStore.addMessage(sessionId, message);
  }

  private resolveContextTokenCount(
    messages: Message[],
    sessionId: string,
    lastAssistant?: AssistantMessage,
  ): number {
    return this.resolveContextTokenCountForMessages(
      messages,
      this.deps.sessionStore.getCompactionSnapshot(sessionId),
      this.agents.get(sessionId)?.state.model.contextWindow,
      lastAssistant,
    );
  }

  private resolveContextTokenCountForMessages(
    messages: Message[],
    snapshot?: CompactionSnapshot,
    contextWindow?: number,
    lastAssistant?: AssistantMessage,
  ): number {
    return getUsageContextTokensFromAssistant(lastAssistant)
      ?? this.compactionService.estimateActiveContextTokens({
        messages,
        snapshot,
        contextWindow,
      });
  }

  private isAutomaticCompactionEnabled(settings: CompactionSettings): boolean {
    return settings.autoCompact;
  }

  private resolveDisplayedContextTokens(options: {
    messages: Message[];
    model: Model<any>;
    snapshot?: import('@shared/types').CompactionSnapshot;
    lastAssistant?: AssistantMessage;
  }): number {
    if (
      options.snapshot?.tokensAfter !== undefined
      && (
        !options.lastAssistant
        || options.snapshot.createdAt > options.lastAssistant.timestamp
      )
    ) {
      return options.snapshot.tokensAfter;
    }

    return getUsageContextTokensFromAssistant(options.lastAssistant)
      ?? this.compactionService.estimateActiveContextTokens({
        messages: options.messages,
        snapshot: options.snapshot,
        contextWindow: options.model.contextWindow,
      });
  }

  private async transformContextForSession(
    sessionId: string,
    messages: AgentMessage[],
  ): Promise<AgentMessage[]> {
    const model = this.agents.get(sessionId)?.state.model;
    const llmCompatibleMessages = defaultConvertToLlm(messages);

    return this.compactionService.buildActiveMessages({
      messages: llmCompatibleMessages,
      snapshot: this.deps.sessionStore.getCompactionSnapshot(sessionId),
      contextWindow: model?.contextWindow,
    });
  }

  private async persistMessages(sessionId: string): Promise<void> {
    const messages = this.deps.sessionStore.getMessages(sessionId);
    // Rewrite the full message array to disk (replaces old messages)
    if (messages.length > 0) {
      await this.deps.persistence.rewriteMessages(sessionId, messages);
    }
  }

  private getAiMessagesForSession(sessionId: string): Message[] {
    return defaultConvertToLlm(this.deps.sessionStore.getMessages(sessionId) as AgentMessage[]);
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

function getLastAssistantMessage(messages: Message[]): AssistantMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === 'assistant') {
      return message;
    }
  }

  return undefined;
}
