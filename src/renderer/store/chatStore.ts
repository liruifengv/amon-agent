import { create } from 'zustand';
import { Message, ImageAttachment } from '../types';

interface ChatState {
  // 按会话缓存消息（来自主进程推送）
  sessionMessages: Record<string, Message[]>;
  // 各会话的加载状态
  sessionLoadingState: Record<string, boolean>;
  // 各会话的错误信息
  sessionErrors: Record<string, string | null>;

  // Getters
  getMessages: (sessionId: string | null) => Message[];
  isSessionLoading: (sessionId: string | null) => boolean;
  getSessionError: (sessionId: string | null) => string | null;

  // Actions（仅用于更新本地缓存，实际数据由主进程管理）
  setMessages: (sessionId: string, messages: Message[]) => void;
  setLoadingState: (sessionId: string, isLoading: boolean) => void;
  setLoadingStates: (states: Record<string, boolean>) => void;
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
  sessionLoadingState: {},
  sessionErrors: {},

  getMessages: (sessionId) => {
    if (!sessionId) return [];
    return get().sessionMessages[sessionId] || [];
  },

  isSessionLoading: (sessionId) => {
    if (!sessionId) return false;
    return get().sessionLoadingState[sessionId] || false;
  },

  getSessionError: (sessionId) => {
    if (!sessionId) return null;
    return get().sessionErrors[sessionId] || null;
  },

  setMessages: (sessionId, messages) =>
    set((state) => ({
      sessionMessages: { ...state.sessionMessages, [sessionId]: messages },
    })),

  setLoadingState: (sessionId, isLoading) =>
    set((state) => ({
      sessionLoadingState: { ...state.sessionLoadingState, [sessionId]: isLoading },
    })),

  setLoadingStates: (states) =>
    set({ sessionLoadingState: states }),

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
      const { [sessionId]: _removedState, ...restLoadingState } = state.sessionLoadingState;
      const { [sessionId]: _removedError, ...restErrors } = state.sessionErrors;
      void _removedMessages;
      void _removedState;
      void _removedError;
      return {
        sessionMessages: restMessages,
        sessionLoadingState: restLoadingState,
        sessionErrors: restErrors,
      };
    }),

  sendMessage: async (content, sessionId, images) => {
    try {
      // 清除之前的错误
      set((state) => ({
        sessionErrors: { ...state.sessionErrors, [sessionId]: null },
      }));

      await window.electronAPI.agent.sendMessage(content, sessionId, images);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      set((state) => ({
        sessionErrors: { ...state.sessionErrors, [sessionId]: errorMessage },
      }));
    }
  },

  interruptMessage: async (sessionId: string) => {
    try {
      await window.electronAPI.agent.interrupt(sessionId);
    } catch (error) {
      console.error('Failed to interrupt message:', error);
    }
  },

  loadMessages: async (sessionId) => {
    try {
      const messages = await window.electronAPI.session.getMessages(sessionId);
      set((state) => ({
        sessionMessages: { ...state.sessionMessages, [sessionId]: messages },
      }));
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  },
}));

// 初始化监听器（模块级别，只执行一次）
if (typeof window !== 'undefined' && window.electronAPI) {
  // 监听消息更新
  window.electronAPI.agent.onMessagesUpdated(({ sessionId, messages }) => {
    useChatStore.getState().setMessages(sessionId, messages);
  });

  // 监听消息状态变化
  window.electronAPI.agent.onMessageState(({ sessionId, isLoading }) => {
    useChatStore.getState().setLoadingState(sessionId, isLoading);
  });

  // 监听消息错误
  window.electronAPI.agent.onMessageError(({ sessionId, error }) => {
    useChatStore.getState().setSessionError(sessionId, error);
  });

  // 监听消息完成（可用于更新 UI 状态）
  window.electronAPI.agent.onMessageComplete(({ sessionId }) => {
    useChatStore.getState().setLoadingState(sessionId, false);
  });
}
