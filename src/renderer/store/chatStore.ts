import { create } from 'zustand';
import type { Message, ImageAttachment, AgentRunState, ToolExecutionState } from '../types';

interface ChatState {
  // 按会话缓存消息（来自主进程推送）
  sessionMessages: Record<string, Message[]>;
  // 各会话的 Agent 运行状态
  agentStates: Record<string, AgentRunState>;
  // 各会话的错误信息
  sessionErrors: Record<string, string | null>;

  // Getters
  getMessages: (sessionId: string | null) => Message[];
  isSessionLoading: (sessionId: string | null) => boolean;
  getAgentState: (sessionId: string | null) => AgentRunState | null;
  getToolExecution: (sessionId: string | null, toolCallId: string) => ToolExecutionState | undefined;
  getSessionError: (sessionId: string | null) => string | null;

  // Actions
  setMessages: (sessionId: string, messages: Message[]) => void;
  setAgentState: (sessionId: string, state: AgentRunState) => void;
  updateToolExecution: (sessionId: string, toolCallId: string, state: ToolExecutionState) => void;
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
      // When agent stops, preserve accumulated tool executions
      const toolExecutions = !agentState.isRunning && current?.toolExecutions
        ? { ...current.toolExecutions, ...agentState.toolExecutions }
        : agentState.toolExecutions;
      return {
        agentStates: {
          ...state.agentStates,
          [sessionId]: { ...agentState, toolExecutions },
        },
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
      const { [sessionId]: _removedError, ...restErrors } = state.sessionErrors;
      void _removedMessages;
      void _removedState;
      void _removedError;
      return {
        sessionMessages: restMessages,
        agentStates: restAgent,
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

  // 监听工具执行状态
  window.push.on('push:toolExecution', ({ sessionId, toolCallId, state }) => {
    useChatStore.getState().updateToolExecution(sessionId, toolCallId, state);
  });

  // 监听错误
  window.push.on('push:error', ({ sessionId, error }) => {
    useChatStore.getState().setSessionError(sessionId, error);
  });
}
