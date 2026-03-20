import { create } from 'zustand';
import type { SessionMessage, ImageAttachment, AgentRunState, ToolExecutionState, CompactionNotice } from '../types';

interface ChatState {
  // 按会话缓存消息（来自主进程推送）
  sessionMessages: Record<string, SessionMessage[]>;
  // 各会话的 Agent 运行状态
  agentStates: Record<string, AgentRunState>;
  // 各会话最近一次压缩通知
  sessionCompactions: Record<string, CompactionNotice | null>;
  // 各会话的错误信息
  sessionErrors: Record<string, string | null>;

  // Getters
  getMessages: (sessionId: string | null) => SessionMessage[];
  isSessionLoading: (sessionId: string | null) => boolean;
  getAgentState: (sessionId: string | null) => AgentRunState | null;
  getToolExecution: (sessionId: string | null, toolCallId: string) => ToolExecutionState | undefined;
  getCompactionNotice: (sessionId: string | null) => CompactionNotice | null;
  getSessionError: (sessionId: string | null) => string | null;

  // Actions
  setMessages: (sessionId: string, messages: SessionMessage[]) => void;
  setAgentState: (sessionId: string, state: AgentRunState) => void;
  updateToolExecution: (sessionId: string, toolCallId: string, state: ToolExecutionState) => void;
  setCompactionNotice: (sessionId: string, notice: CompactionNotice) => void;
  setSessionError: (sessionId: string, error: string | null) => void;
  clearSessionError: (sessionId: string) => void;
  clearSessionCache: (sessionId: string) => void;

  // 发送到主进程
  sendMessage: (content: string, sessionId: string, images?: ImageAttachment[]) => Promise<void>;
  interruptMessage: (sessionId: string) => Promise<void>;
  loadMessages: (sessionId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessionMessages: {},
  agentStates: {},
  sessionCompactions: {},
  sessionErrors: {},

  getMessages: (sessionId) => {
    if (!sessionId) return [];
    return get().sessionMessages[sessionId] || [];
  },

  isSessionLoading: (sessionId) => {
    if (!sessionId) return false;
    return get().agentStates[sessionId]?.isRunning || false;
  },

  getAgentState: (sessionId) => {
    if (!sessionId) return null;
    return get().agentStates[sessionId] || null;
  },

  getToolExecution: (sessionId, toolCallId) => {
    if (!sessionId) return undefined;
    return get().agentStates[sessionId]?.toolExecutions?.[toolCallId];
  },

  getCompactionNotice: (sessionId) => {
    if (!sessionId) return null;
    return get().sessionCompactions[sessionId] || null;
  },

  getSessionError: (sessionId) => {
    if (!sessionId) return null;
    return get().sessionErrors[sessionId] || null;
  },

  setMessages: (sessionId, messages) =>
    set((state) => ({
      sessionMessages: { ...state.sessionMessages, [sessionId]: messages },
    })),

  setAgentState: (sessionId, agentState) =>
    set((state) => {
      const current = state.agentStates[sessionId];
      const toolExecutions = Object.keys(agentState.toolExecutions).length === 0 && current?.toolExecutions
        ? current.toolExecutions
        : { ...(current?.toolExecutions ?? {}), ...agentState.toolExecutions };
      return {
        agentStates: {
          ...state.agentStates,
          [sessionId]: { ...agentState, toolExecutions },
        },
        sessionCompactions: agentState.lastCompaction
          ? { ...state.sessionCompactions, [sessionId]: agentState.lastCompaction }
          : state.sessionCompactions,
      };
    }),

  updateToolExecution: (sessionId, toolCallId, toolState) =>
    set((state) => {
      const current = state.agentStates[sessionId] || {
        isRunning: false,
        toolExecutions: {},
      };
      return {
        agentStates: {
          ...state.agentStates,
          [sessionId]: {
            ...current,
            toolExecutions: {
              ...current.toolExecutions,
              [toolCallId]: toolState,
            },
          },
        },
      };
    }),

  setCompactionNotice: (sessionId, notice) =>
    set((state) => ({
      sessionCompactions: { ...state.sessionCompactions, [sessionId]: notice },
    })),

  setSessionError: (sessionId, error) =>
    set((state) => ({
      sessionErrors: { ...state.sessionErrors, [sessionId]: error },
    })),

  clearSessionError: (sessionId) =>
    set((state) => ({
      sessionErrors: { ...state.sessionErrors, [sessionId]: null },
    })),

  clearSessionCache: (sessionId) =>
    set((state) => {
      const { [sessionId]: _removedMessages, ...restMessages } = state.sessionMessages;
      const { [sessionId]: _removedState, ...restAgent } = state.agentStates;
      const { [sessionId]: _removedCompaction, ...restCompactions } = state.sessionCompactions;
      const { [sessionId]: _removedError, ...restErrors } = state.sessionErrors;
      void _removedMessages;
      void _removedState;
      void _removedCompaction;
      void _removedError;
      return {
        sessionMessages: restMessages,
        agentStates: restAgent,
        sessionCompactions: restCompactions,
        sessionErrors: restErrors,
      };
    }),

  sendMessage: async (content, sessionId, images) => {
    try {
      set((state) => ({
        sessionErrors: { ...state.sessionErrors, [sessionId]: null },
      }));

      await window.ipc.agent.sendMessage(content, sessionId, images);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      set((state) => ({
        sessionErrors: { ...state.sessionErrors, [sessionId]: errorMessage },
      }));
    }
  },

  interruptMessage: async (sessionId: string) => {
    try {
      await window.ipc.agent.interrupt(sessionId);
    } catch (error) {
      console.error('Failed to interrupt message:', error);
    }
  },

  loadMessages: async (sessionId) => {
    try {
      const messages = await window.ipc.session.getMessages(sessionId);
      set((state) => ({
        sessionMessages: { ...state.sessionMessages, [sessionId]: messages },
      }));
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  },
}));

// ==================== 初始化 Push 监听器 ====================

if (typeof window !== 'undefined' && window.push) {
  // 监听消息更新
  window.push.on('push:messagesUpdated', ({ sessionId, messages }) => {
    useChatStore.getState().setMessages(sessionId, messages);
  });

  // 监听 Agent 状态变化
  window.push.on('push:agentState', ({ sessionId, state }) => {
    useChatStore.getState().setAgentState(sessionId, state);
  });

  window.push.on('push:compaction', ({ sessionId, notice }) => {
    useChatStore.getState().setCompactionNotice(sessionId, notice);
  });

  // 监听工具执行状态
  window.push.on('push:toolExecution', ({ sessionId, toolCallId, state }) => {
    useChatStore.getState().updateToolExecution(sessionId, toolCallId, state);
  });

  // 监听错误
  window.push.on('push:error', ({ sessionId, error }) => {
    useChatStore.getState().setSessionError(sessionId, error);
  });
}
