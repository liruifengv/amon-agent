import { create } from 'zustand';
import { Message, QueryOptions, PermissionMode } from '../types';

interface ChatState {
  // 按会话缓存消息（来自主进程推送）
  sessionMessages: Record<string, Message[]>;
  // 各会话的加载状态
  sessionLoadingState: Record<string, boolean>;
  // 各会话的临时权限模式（覆盖全局设置）
  sessionPermissionMode: Record<string, PermissionMode | undefined>;
  // 错误信息
  error: string | null;

  // Getters
  getMessages: (sessionId: string | null) => Message[];
  isSessionLoading: (sessionId: string | null) => boolean;
  getSessionPermissionMode: (sessionId: string | null) => PermissionMode | undefined;

  // Actions（仅用于更新本地缓存，实际数据由主进程管理）
  setMessages: (sessionId: string, messages: Message[]) => void;
  setLoadingState: (sessionId: string, isLoading: boolean) => void;
  setLoadingStates: (states: Record<string, boolean>) => void;
  setSessionPermissionMode: (sessionId: string, mode: PermissionMode | undefined) => void;
  setError: (error: string | null) => void;
  clearSessionCache: (sessionId: string) => void;

  // 发送到主进程
  sendMessage: (content: string, sessionId: string, options?: QueryOptions) => Promise<void>;
  interruptQuery: (sessionId: string) => Promise<void>;
  loadMessages: (sessionId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessionMessages: {},
  sessionLoadingState: {},
  sessionPermissionMode: {},
  error: null,

  getMessages: (sessionId) => {
    if (!sessionId) return [];
    return get().sessionMessages[sessionId] || [];
  },

  isSessionLoading: (sessionId) => {
    if (!sessionId) return false;
    return get().sessionLoadingState[sessionId] || false;
  },

  getSessionPermissionMode: (sessionId) => {
    if (!sessionId) return undefined;
    return get().sessionPermissionMode[sessionId];
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

  setSessionPermissionMode: (sessionId, mode) =>
    set((state) => ({
      sessionPermissionMode: { ...state.sessionPermissionMode, [sessionId]: mode },
    })),

  setError: (error) => set({ error }),

  clearSessionCache: (sessionId) =>
    set((state) => {
      const { [sessionId]: _removedMessages, ...restMessages } = state.sessionMessages;
      const { [sessionId]: _removedState, ...restLoadingState } = state.sessionLoadingState;
      const { [sessionId]: _removedMode, ...restPermissionMode } = state.sessionPermissionMode;
      void _removedMessages;
      void _removedState;
      void _removedMode;
      return {
        sessionMessages: restMessages,
        sessionLoadingState: restLoadingState,
        sessionPermissionMode: restPermissionMode,
      };
    }),

  sendMessage: async (content, sessionId, options) => {
    try {
      // 如果有临时权限模式，合并到 options 中
      const sessionMode = get().sessionPermissionMode[sessionId];
      const mergedOptions: QueryOptions | undefined = sessionMode || options
        ? { ...options, permissionMode: options?.permissionMode ?? sessionMode }
        : undefined;

      await window.electronAPI.agent.query(content, sessionId, mergedOptions);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      set({ error: errorMessage });
    }
  },

  interruptQuery: async (sessionId) => {
    try {
      await window.electronAPI.agent.interrupt(sessionId);
    } catch (error) {
      console.error('Failed to interrupt query:', error);
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

  // 监听查询状态变化
  window.electronAPI.agent.onQueryState(({ sessionId, isLoading }) => {
    useChatStore.getState().setLoadingState(sessionId, isLoading);
  });

  // 监听查询错误
  window.electronAPI.agent.onQueryError(({ error }) => {
    useChatStore.getState().setError(error);
  });

  // 监听查询完成（可用于更新 UI 状态）
  window.electronAPI.agent.onQueryComplete(({ sessionId }) => {
    useChatStore.getState().setLoadingState(sessionId, false);
  });
}
