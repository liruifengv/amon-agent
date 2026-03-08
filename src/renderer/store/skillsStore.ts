import { create } from 'zustand';
import type { SkillInfo, BuiltinSkillMeta } from '../../shared/types';

interface SkillsState {
  /** Installed skills list */
  installed: SkillInfo[];
  /** Built-in skill metadata list */
  builtin: BuiltinSkillMeta[];
  /** Loading state */
  isLoading: boolean;
  /** Name of skill currently being operated on (install/uninstall/toggle) */
  pendingAction: string | null;

  // Actions
  loadSkills: (workspace?: string) => Promise<void>;
  installSkill: (name: string) => Promise<void>;
  uninstallSkill: (name: string) => Promise<void>;
  toggleDisable: (name: string, disabled: boolean) => Promise<void>;
  getSkillContent: (dirPath: string) => Promise<string>;
  openFolder: (dirPath: string) => Promise<void>;
}

export const useSkillsStore = create<SkillsState>((set, get) => ({
  installed: [],
  builtin: [],
  isLoading: false,
  pendingAction: null,

  loadSkills: async (workspace?: string) => {
    set({ isLoading: true });
    try {
      const result = await window.ipc.skills.list(workspace);
      set({
        installed: result.installed,
        builtin: result.builtin,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to load skills:', error);
      set({ isLoading: false });
    }
  },

  installSkill: async (name: string) => {
    set({ pendingAction: name });
    try {
      await window.ipc.skills.install(name);
      // push:skillsChanged will trigger loadSkills refresh
    } catch (error) {
      console.error('Failed to install skill:', error);
    } finally {
      set({ pendingAction: null });
    }
  },

  uninstallSkill: async (name: string) => {
    set({ pendingAction: name });
    try {
      await window.ipc.skills.uninstall(name);
    } catch (error) {
      console.error('Failed to uninstall skill:', error);
    } finally {
      set({ pendingAction: null });
    }
  },

  toggleDisable: async (name: string, disabled: boolean) => {
    // Optimistic update
    set(state => ({
      installed: state.installed.map(s =>
        s.name === name ? { ...s, disabled } : s,
      ),
    }));
    try {
      await window.ipc.skills.toggleDisable(name, disabled);
    } catch (error) {
      console.error('Failed to toggle skill:', error);
      // Rollback
      set(state => ({
        installed: state.installed.map(s =>
          s.name === name ? { ...s, disabled: !disabled } : s,
        ),
      }));
    }
  },

  getSkillContent: async (dirPath: string) => {
    return await window.ipc.skills.getContent(dirPath);
  },

  openFolder: async (dirPath: string) => {
    await window.ipc.skills.openFolder(dirPath);
  },
}));
