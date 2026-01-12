import { create } from 'zustand';
import { Session } from '../types';

interface SessionState {
  sessions: Session[];
  currentSessionId: string | null;
  isLoading: boolean;

  // Actions
  setSessions: (sessions: Session[]) => void;
  setCurrentSessionId: (id: string | null) => void;
  loadSessions: () => Promise<void>;
  createSession: (name?: string, workspace?: string) => Promise<Session>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, name: string) => Promise<void>;
  updateSessionWorkspace: (id: string, workspace: string) => Promise<void>;
  loadCurrentSession: () => Promise<Session | null>;
  updateSdkSessionId: (sessionId: string, sdkSessionId: string) => Promise<void>;
  getCurrentSdkSessionId: () => string | undefined;
  getCurrentWorkspace: () => string | undefined;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  isLoading: true,

  setSessions: (sessions) => set({ sessions }),

  setCurrentSessionId: (id) => set({ currentSessionId: id }),

  loadSessions: async () => {
    set({ isLoading: true });
    try {
      const sessions = await window.electronAPI.session.list();
      set({ sessions, isLoading: false });

      // 如果没有当前会话，且有会话列表，选择第一个
      const { currentSessionId } = get();
      if (!currentSessionId && sessions.length > 0) {
        set({ currentSessionId: sessions[0].id });
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      set({ isLoading: false });
    }
  },

  createSession: async (name, workspace) => {
    try {
      const session = await window.electronAPI.session.create(
        workspace ? { name, workspace } : name
      );
      set((state) => ({
        sessions: [session, ...state.sessions],
        currentSessionId: session.id,
      }));
      return session;
    } catch (error) {
      console.error('Failed to create session:', error);
      throw error;
    }
  },

  deleteSession: async (id) => {
    try {
      await window.electronAPI.session.delete(id);
      set((state) => {
        const newSessions = state.sessions.filter((s) => s.id !== id);
        const newCurrentId =
          state.currentSessionId === id
            ? newSessions[0]?.id || null
            : state.currentSessionId;
        return {
          sessions: newSessions,
          currentSessionId: newCurrentId,
        };
      });
    } catch (error) {
      console.error('Failed to delete session:', error);
      throw error;
    }
  },

  renameSession: async (id, name) => {
    try {
      const updated = await window.electronAPI.session.rename(id, name);
      if (updated) {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, name } : s
          ),
        }));
      }
    } catch (error) {
      console.error('Failed to rename session:', error);
      throw error;
    }
  },

  updateSessionWorkspace: async (id, workspace) => {
    try {
      const result = await window.electronAPI.session.updateWorkspace(id, workspace);
      if (result.success) {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, workspace } : s
          ),
        }));
      }
    } catch (error) {
      console.error('Failed to update session workspace:', error);
      throw error;
    }
  },

  loadCurrentSession: async () => {
    const { currentSessionId, sessions } = get();
    if (!currentSessionId) return null;
    return sessions.find((s) => s.id === currentSessionId) ?? null;
  },

  updateSdkSessionId: async (sessionId: string, sdkSessionId: string) => {
    // 更新 sessions 列表（主进程已经处理了持久化）
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, sdkSessionId } : s
      ),
    }));
  },

  getCurrentSdkSessionId: () => {
    const { currentSessionId, sessions } = get();
    if (!currentSessionId) return undefined;
    const session = sessions.find((s) => s.id === currentSessionId);
    return session?.sdkSessionId;
  },

  getCurrentWorkspace: () => {
    const { currentSessionId, sessions } = get();
    if (!currentSessionId) return undefined;
    const session = sessions.find((s) => s.id === currentSessionId);
    return session?.workspace;
  },
}));
