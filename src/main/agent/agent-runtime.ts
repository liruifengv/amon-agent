import { nanoid } from 'nanoid';
import type {
  UserMessage,
  AssistantMessage,
  ToolUseBlock,
  ToolResultBlock,
  ImageAttachment,
} from '@shared/types';
import type { SessionStore } from '../store/session-store';
import type { Persistence } from '../store/persistence';
import type { ProviderRegistry } from '../provider/provider-registry';
import type { ToolRegistry } from '../tools/tool-registry';
import type { ContextManager } from './context-manager';
import type { StreamNormalizer } from './stream-normalizer';
import type { PushService } from '../ipc/push';
import type { ConfigStore } from '../store/config-store';
import { SkillsStore, formatSkillsForPrompt } from '../skills';
import { ensureBootstrapFiles, loadWorkspaceBootstrapFiles, loadProjectAgentsFile } from '../workspace';
import { buildSystemPrompt } from './system-prompt';
import { DEFAULT_MAX_THINKING_TOKENS } from '@shared/constants';

interface AgentRuntimeDeps {
  sessionStore: SessionStore;
  persistence: Persistence;
  providerRegistry: ProviderRegistry;
  toolRegistry: ToolRegistry;
  contextManager: ContextManager;
  streamNormalizer: StreamNormalizer;
  pushService: PushService;
  configStore: ConfigStore;
  skillsStore: SkillsStore;
}

const THINKING_BUDGET_MAP: Record<string, number> = {
  off: 0,
  low: 4096,
  medium: DEFAULT_MAX_THINKING_TOKENS,
  high: 32000,
  xhigh: 32000,
};

export class AgentRuntime {
  private abortControllers = new Map<string, AbortController>();

  constructor(private deps: AgentRuntimeDeps) {}

  async run(sessionId: string, prompt: string, images?: ImageAttachment[]): Promise<void> {
    // 0. If there's an active run for this session, abort it
    this.abort(sessionId);

    const ac = new AbortController();
    this.abortControllers.set(sessionId, ac);

    const {
      sessionStore, persistence, providerRegistry, toolRegistry,
      contextManager, streamNormalizer, pushService, configStore, skillsStore,
    } = this.deps;

    // 1. Get config
    const session = sessionStore.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const settings = await configStore.getSettings();
    const agentSettings = settings.agent;

    const thinkingBudget = agentSettings.thinkingLevel !== 'off'
      ? THINKING_BUDGET_MAP[agentSettings.thinkingLevel] ?? DEFAULT_MAX_THINKING_TOKENS
      : undefined;

    // Load skills for current workspace
    await skillsStore.load(session.workspace);
    const skillsPrompt = formatSkillsForPrompt(skillsStore.getSkills());

    // Ensure workspace bootstrap files are seeded, then load them
    await ensureBootstrapFiles();
    const workspaceFiles = await loadWorkspaceBootstrapFiles();

    // Load project-level AGENTS.md from workspace root
    const projectAgentsFile = await loadProjectAgentsFile(session.workspace);

    const systemPrompt = buildSystemPrompt({
      workspace: session.workspace,
      tools: toolRegistry.getAll(),
      skillsPrompt,
      workspaceFiles,
      projectAgentsFile: projectAgentsFile ?? undefined,
    });

    console.log('====================');
    console.log('System Prompt:', systemPrompt);
    console.log('====================');

    // 2. Create messages
    const userMsg: UserMessage = {
      id: nanoid(),
      role: 'user',
      content: prompt,
      images: images?.length ? images : undefined,
      timestamp: Date.now(),
    };
    const assistantMsg: AssistantMessage = {
      id: nanoid(),
      role: 'assistant',
      content: [],
      provider: agentSettings.activeProviderId,
      model: agentSettings.activeModelId,
      timestamp: Date.now(),
    };

    sessionStore.addMessage(sessionId, userMsg);
    sessionStore.addMessage(sessionId, assistantMsg);

    // Notify UI: streaming started
    pushService.pushStreamingState(sessionId, {
      isStreaming: true,
      blockCompletionMap: {},
      toolCallStates: {},
    });

    try {
      // 3. Conversation loop
      let turn = 0;
      while (turn < agentSettings.maxTurns) {
        turn++;

        // 3a. Build provider messages
        const allMessages = sessionStore.getMessages(sessionId);
        const providerMessages = contextManager.buildProviderMessages(allMessages);
        const toolDefs = toolRegistry.toProviderToolDefs();

        // 3b. Call provider (sync registry if adapter missing)
        if (!providerRegistry.hasAdapter(agentSettings.activeProviderId)) {
          await providerRegistry.syncFromConfig(configStore);
        }
        if (!providerRegistry.hasAdapter(agentSettings.activeProviderId)) {
          throw new Error(`Provider "${agentSettings.activeProviderId}" not found or not configured. Please check your API key settings.`);
        }
        const adapter = providerRegistry.getAdapter(agentSettings.activeProviderId);
        const activeProviderConfig = agentSettings.providerConfigs.find(
          c => c.id === agentSettings.activeProviderId,
        );
        const stream = adapter.stream({
          model: agentSettings.activeModelId,
          messages: providerMessages,
          tools: toolDefs.length > 0 ? toolDefs : undefined,
          systemPrompt,
          thinkingBudget,
          thinkingLevel: agentSettings.thinkingLevel,
          signal: ac.signal,
          extraParams: activeProviderConfig?.extraParams,
          customHeaders: activeProviderConfig?.customHeaders,
        });

        // 3c. Process stream
        const stopReason = await streamNormalizer.processStream(
          sessionId,
          assistantMsg.id,
          stream,
        );

        // 3d. Check if tools need execution
        if (stopReason === 'tool_use') {
          const currentContent = (sessionStore.getMessages(sessionId)
            .find(m => m.id === assistantMsg.id) as AssistantMessage | undefined)
            ?.content ?? [];

          const toolUseBlocks = currentContent
            .filter((b): b is ToolUseBlock => b.type === 'tool_use')
            .filter(b => {
              // Only execute tool_use blocks that don't have a corresponding tool_result
              return !currentContent.some(
                r => r.type === 'tool_result' && (r as ToolResultBlock).toolUseId === b.id,
              );
            });

          // Execute tools in parallel
          const results = await Promise.all(
            toolUseBlocks.map(async (block) => {
              pushService.pushToolCallState(sessionId, block.id, { status: 'running' });

              const result = await toolRegistry.execute(
                block.name,
                block.input,
                { cwd: session.workspace, signal: ac.signal },
              );

              pushService.pushToolCallState(sessionId, block.id, {
                status: result.isError ? 'error' : 'completed',
                output: result.output,
                isError: result.isError,
              });

              return {
                type: 'tool_result' as const,
                toolUseId: block.id,
                output: result.output,
                isError: result.isError,
              } satisfies ToolResultBlock;
            }),
          );

          // Append tool_results to assistant message content
          for (const result of results) {
            sessionStore.appendContentBlock(sessionId, assistantMsg.id, result);
          }
        } else {
          // end_turn / max_tokens / error → exit loop
          break;
        }
      }
    } finally {
      this.abortControllers.delete(sessionId);

      // Notify UI: streaming ended
      pushService.pushStreamingState(sessionId, {
        isStreaming: false,
        blockCompletionMap: {},
        toolCallStates: {},
      });

      // Persist messages
      const finalMessages = sessionStore.getMessages(sessionId);
      const userMsgFinal = finalMessages.find(m => m.id === userMsg.id);
      const assistantMsgFinal = finalMessages.find(m => m.id === assistantMsg.id);
      if (userMsgFinal && assistantMsgFinal) {
        await persistence.appendMessages(sessionId, [userMsgFinal, assistantMsgFinal]);
      }
    }
  }

  abort(sessionId: string): void {
    const ac = this.abortControllers.get(sessionId);
    if (ac) {
      ac.abort();
      this.abortControllers.delete(sessionId);
    }
  }

  isRunning(sessionId: string): boolean {
    return this.abortControllers.has(sessionId);
  }
}
