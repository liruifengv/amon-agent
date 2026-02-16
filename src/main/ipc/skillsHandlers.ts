import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { SkillsLoadResult, RecommendedSkill, SkillInstallTarget } from '../../shared/types';
import * as skillsStore from '../store/skillsStore';

export function registerSkillsHandlers(): void {
  // 加载所有 skills
  ipcMain.handle(IPC_CHANNELS.SKILLS_LOAD, async (): Promise<SkillsLoadResult> => {
    return await skillsStore.loadAllSkills();
  });

  // 列出推荐的 skills
  ipcMain.handle(IPC_CHANNELS.SKILLS_LIST_RECOMMENDED, async (): Promise<RecommendedSkill[]> => {
    return await skillsStore.listRecommendedSkills();
  });

  // 安装 skill
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_INSTALL,
    async (_event, params: { skillId: string; target: SkillInstallTarget; workspacePath?: string }): Promise<{ success: boolean; error?: string }> => {
      try {
        await skillsStore.installSkill(params.skillId, params.target, params.workspacePath);
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
      }
    }
  );

  // 卸载 skill
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_UNINSTALL,
    async (_event, skillPath: string): Promise<{ success: boolean; error?: string }> => {
      try {
        await skillsStore.uninstallSkill(skillPath);
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
      }
    }
  );
}
