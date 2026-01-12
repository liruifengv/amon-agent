import { create } from 'zustand';
import { ToolPermissionRequest, PermissionResult, AskUserQuestionRequest } from '../types';

interface PermissionState {
  // 当前待处理的权限请求（按会话分）
  pendingRequests: Record<string, ToolPermissionRequest>;

  // 当前待处理的问题请求（按会话分）
  pendingQuestionRequests: Record<string, AskUserQuestionRequest>;

  // Actions
  setPendingRequest: (request: ToolPermissionRequest) => void;
  clearPendingRequest: (sessionId: string) => void;
  getPendingRequest: (sessionId: string) => ToolPermissionRequest | null;

  // 响应权限请求
  respondToRequest: (requestId: string, result: PermissionResult) => Promise<void>;

  // AskUserQuestion Actions
  setPendingQuestionRequest: (request: AskUserQuestionRequest) => void;
  clearPendingQuestionRequest: (sessionId: string) => void;
  getPendingQuestionRequest: (sessionId: string) => AskUserQuestionRequest | null;

  // 响应问题请求
  respondToQuestionRequest: (requestId: string, answers: Record<string, string>) => Promise<void>;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  pendingRequests: {},
  pendingQuestionRequests: {},

  setPendingRequest: (request) =>
    set((state) => ({
      pendingRequests: { ...state.pendingRequests, [request.sessionId]: request },
    })),

  clearPendingRequest: (sessionId) =>
    set((state) => {
      const { [sessionId]: removed, ...rest } = state.pendingRequests;
      void removed;
      return { pendingRequests: rest };
    }),

  getPendingRequest: (sessionId) => {
    return get().pendingRequests[sessionId] || null;
  },

  respondToRequest: async (requestId, result) => {
    // 发送响应到主进程（主进程会保存权限记录到消息）
    await window.electronAPI.permission.respond(requestId, result);

    // 清除对应的待处理请求
    const requests = get().pendingRequests;
    for (const [sessionId, request] of Object.entries(requests)) {
      if (request.id === requestId) {
        get().clearPendingRequest(sessionId);
        break;
      }
    }
  },

  // AskUserQuestion 相关
  setPendingQuestionRequest: (request) =>
    set((state) => ({
      pendingQuestionRequests: { ...state.pendingQuestionRequests, [request.sessionId]: request },
    })),

  clearPendingQuestionRequest: (sessionId) =>
    set((state) => {
      const { [sessionId]: removed, ...rest } = state.pendingQuestionRequests;
      void removed;
      return { pendingQuestionRequests: rest };
    }),

  getPendingQuestionRequest: (sessionId) => {
    return get().pendingQuestionRequests[sessionId] || null;
  },

  respondToQuestionRequest: async (requestId, answers) => {
    // 发送响应到主进程（主进程会保存问题记录到消息）
    await window.electronAPI.askUserQuestion.respond(requestId, answers);

    // 清除对应的待处理请求
    const requests = get().pendingQuestionRequests;
    for (const [sessionId, request] of Object.entries(requests)) {
      if (request.id === requestId) {
        get().clearPendingQuestionRequest(sessionId);
        break;
      }
    }
  },
}));

// 初始化监听器（模块级别，只执行一次）
if (typeof window !== 'undefined' && window.electronAPI) {
  // 监听权限请求
  window.electronAPI.permission.onRequest((request) => {
    usePermissionStore.getState().setPendingRequest(request);
  });

  // 监听用户问题请求
  window.electronAPI.askUserQuestion.onRequest((request) => {
    usePermissionStore.getState().setPendingQuestionRequest(request);
  });
}
