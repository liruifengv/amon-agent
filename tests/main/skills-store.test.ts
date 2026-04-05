import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn(() => process.cwd()),
  },
}));

import { SkillsStore } from '@/main/skills';

describe('SkillsStore uninstallSkill', () => {
  let tempDir: string;
  let homeDir: string;
  let workspaceDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'amon-skills-store-'));
    homeDir = path.join(tempDir, 'home');
    workspaceDir = path.join(tempDir, 'workspace');

    await mkdir(homeDir, { recursive: true });
    await mkdir(workspaceDir, { recursive: true });

    vi.spyOn(os, 'homedir').mockReturnValue(homeDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  function createStore(extraDirs: string[] = ['.claude']): SkillsStore {
    return new SkillsStore({
      getSettings: vi.fn(async () => ({
        skills: {
          extraDirs,
        },
      })),
    } as never);
  }

  it('removes a workspace skill from .amon/skills', async () => {
    const skillDir = path.join(workspaceDir, '.amon', 'skills', 'workspace-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\ndescription: Workspace skill\n---\n');

    const store = createStore();
    await store.uninstallSkill(skillDir, workspaceDir);

    expect(fs.existsSync(skillDir)).toBe(false);
  });

  it('removes a skill from configured extra skill directories', async () => {
    const skillDir = path.join(homeDir, '.claude', 'skills', 'global-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\ndescription: Global skill\n---\n');

    const store = createStore();
    await store.uninstallSkill(skillDir, workspaceDir);

    expect(fs.existsSync(skillDir)).toBe(false);
  });

  it('rejects deleting directories outside configured skill roots', async () => {
    const outsideDir = path.join(tempDir, 'outside-skill');
    await mkdir(outsideDir, { recursive: true });

    const store = createStore();

    await expect(store.uninstallSkill(outsideDir, workspaceDir)).rejects.toThrow(
      'Cannot uninstall skill outside configured skill directories',
    );
    expect(fs.existsSync(outsideDir)).toBe(true);
  });
});
