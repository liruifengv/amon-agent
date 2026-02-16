import { create } from 'zustand';
import type { Session } from '../types';

interface SessionState {
  sessions: Session[];
  currentSessionId: string | null;
  isLoading: boolean;

  // Actions
  setSessions: (sessions: Session[]) => void;
  setCurrentSessionId: (id: string | null) => void;
  loadSessions: () => Promise<void>;
  createSession: (workspace?: string) => Promise<Session>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  updateSessionWorkspace: (id: string, workspace: string) => Promise<void>;
  loadCurrentSession: () => Promise<Session | null>;
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
      const sessions = await window.ipc.session.list();
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

  createSession: async (workspace?) => {
    try {
      // Only send IPC — the push:sessionCreated event in App.tsx
      // handles adding the session to state (with dedup).
      const session = await window.ipc.session.create(workspace);
      return session;
    } catch (error) {
      console.error('Failed to create session:', error);
      throw error;
    }
  },

  deleteSession: async (id) => {
    try {
      // Only send IPC — the push:sessionDeleted event in App.tsx
      // handles removing from state.
      await window.ipc.session.delete(id);
    } catch (error) {
      console.error('Failed to delete session:', error);
      throw error;
    }
  },

  renameSession: async (id, title) => {
    try {
      // push:sessionUpdated in App.tsx handles state update
      await window.ipc.session.rename(id, title);
    } catch (error) {
      console.error('Failed to rename session:', error);
      throw error;
    }
  },

  updateSessionWorkspace: async (id, workspace) => {
    try {
      // push:sessionUpdated in App.tsx handles state update
      await window.ipc.session.updateWorkspace(id, workspace);
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

  getCurrentWorkspace: () => {
    const { currentSessionId, sessions } = get();
    if (!currentSessionId) return undefined;
    const session = sessions.find((s) => s.id === currentSessionId);
    return session?.workspace;
  },
}));
