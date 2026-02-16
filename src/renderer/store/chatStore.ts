import { create } from 'zustand';
import type { Message, ImageAttachment, StreamingState, ToolCallState } from '../types';

interface ChatState {
  // 按会话缓存消息（来自主进程推送）
  sessionMessages: Record<string, Message[]>;
  // 各会话的流式状态
  streamingStates: Record<string, StreamingState>;
  // 各会话的错误信息
  sessionErrors: Record<string, string | null>;

  // Getters
  getMessages: (sessionId: string | null) => Message[];
  isSessionLoading: (sessionId: string | null) => boolean;
  getStreamingState: (sessionId: string | null) => StreamingState | null;
  getToolCallState: (sessionId: string | null, toolCallId: string) => ToolCallState | undefined;
  getSessionError: (sessionId: string | null) => string | null;

  // Actions（仅用于更新本地缓存，实际数据由主进程管理）
  setMessages: (sessionId: string, messages: Message[]) => void;
  setStreamingState: (sessionId: string, state: StreamingState) => void;
  updateToolCallState: (sessionId: string, toolCallId: string, state: ToolCallState) => void;
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
  streamingStates: {},
  sessionErrors: {},

  getMessages: (sessionId) => {
    if (!sessionId) return [];
    return get().sessionMessages[sessionId] || [];
  },

  isSessionLoading: (sessionId) => {
    if (!sessionId) return false;
    return get().streamingStates[sessionId]?.isStreaming || false;
  },

  getStreamingState: (sessionId) => {
    if (!sessionId) return null;
    return get().streamingStates[sessionId] || null;
  },

  getToolCallState: (sessionId, toolCallId) => {
    if (!sessionId) return undefined;
    return get().streamingStates[sessionId]?.toolCallStates?.[toolCallId];
  },

  getSessionError: (sessionId) => {
    if (!sessionId) return null;
    return get().sessionErrors[sessionId] || null;
  },

  setMessages: (sessionId, messages) =>
    set((state) => ({
      sessionMessages: { ...state.sessionMessages, [sessionId]: messages },
    })),

  setStreamingState: (sessionId, streamState) =>
    set((state) => {
      const current = state.streamingStates[sessionId];
      // When streaming ends, preserve accumulated tool call states
      // so completed tools don't revert to 'pending' spinners
      const toolCallStates = !streamState.isStreaming && current?.toolCallStates
        ? { ...current.toolCallStates, ...streamState.toolCallStates }
        : streamState.toolCallStates;
      return {
        streamingStates: {
          ...state.streamingStates,
          [sessionId]: { ...streamState, toolCallStates },
        },
      };
    }),

  updateToolCallState: (sessionId, toolCallId, toolState) =>
    set((state) => {
      const current = state.streamingStates[sessionId] || {
        isStreaming: false,
        blockCompletionMap: {},
        toolCallStates: {},
      };
      return {
        streamingStates: {
          ...state.streamingStates,
          [sessionId]: {
            ...current,
            toolCallStates: {
              ...current.toolCallStates,
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
      const { [sessionId]: _removedState, ...restStreaming } = state.streamingStates;
      const { [sessionId]: _removedError, ...restErrors } = state.sessionErrors;
      void _removedMessages;
      void _removedState;
      void _removedError;
      return {
        sessionMessages: restMessages,
        streamingStates: restStreaming,
        sessionErrors: restErrors,
      };
    }),

  sendMessage: async (content, sessionId, images) => {
    try {
      // 清除之前的错误
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

  // 监听流式状态变化（替代旧的 messageState + messageComplete）
  window.push.on('push:streamingState', ({ sessionId, state }) => {
    useChatStore.getState().setStreamingState(sessionId, state);
  });

  // 监听工具调用状态
  window.push.on('push:toolCallState', ({ sessionId, toolCallId, state }) => {
    useChatStore.getState().updateToolCallState(sessionId, toolCallId, state);
  });

  // 监听错误
  window.push.on('push:error', ({ sessionId, error }) => {
    useChatStore.getState().setSessionError(sessionId, error);
  });
}
