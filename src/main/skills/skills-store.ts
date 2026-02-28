import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { Skill, SkillDiagnostic, SkillsLoadResult } from '@shared/types';
import type { ConfigStore } from '../store/config-store';
import { loadSkillsFromDir } from './skills-loader';
import { createLogger } from '../store/logger';

const log = createLogger('SkillsStore');

export class SkillsStore {
  private skillMap = new Map<string, Skill>();
  private diagnostics: SkillDiagnostic[] = [];
  private cachedWorkspace: string | null = null;
  private loaded = false;

  constructor(private configStore: ConfigStore) {}

  async load(workspace: string): Promise<SkillsLoadResult> {
    // Cache hit
    if (this.cachedWorkspace === workspace && this.skillMap.size > 0) {
      return { skills: this.getSkills(), diagnostics: this.diagnostics };
    }

    this.skillMap.clear();
    this.diagnostics = [];
    const realPathSet = new Set<string>();

    const settings = await this.configStore.getSettings();
    const extraDirs = settings.skills.extraDirs;

    // 1. extraDirs (default contains ".claude"): system-level then project-level (later wins)
    for (const dirName of extraDirs) {
      const systemDir = path.join(os.homedir(), dirName, 'skills');
      this.mergeSkills(loadSkillsFromDir({ dir: systemDir, source: 'extra' }), realPathSet);

      const projectDir = path.join(workspace, dirName, 'skills');
      this.mergeSkills(loadSkillsFromDir({ dir: projectDir, source: 'extra' }), realPathSet);
    }

    // 2. System-level ~/.amon/skills/
    const systemAmonDir = path.join(os.homedir(), '.amon', 'skills');
    this.mergeSkills(loadSkillsFromDir({ dir: systemAmonDir, source: 'system-amon' }), realPathSet);

    // 3. Project-level <workspace>/.amon/skills/ (highest priority)
    const projectAmonDir = path.join(workspace, '.amon', 'skills');
    this.mergeSkills(loadSkillsFromDir({ dir: projectAmonDir, source: 'project-amon' }), realPathSet);

    this.cachedWorkspace = workspace;
    log.info(`Skills loaded: ${this.skillMap.size} skills, ${this.diagnostics.length} diagnostics`);

    return { skills: this.getSkills(), diagnostics: this.diagnostics };
  }

  private mergeSkills(result: SkillsLoadResult, realPathSet: Set<string>): void {
    this.diagnostics.push(...result.diagnostics);

    for (const skill of result.skills) {
      // Deduplicate symlinks
      try {
        const realPath = fs.realpathSync(skill.filePath);
        if (realPathSet.has(realPath)) {
          this.diagnostics.push({
            type: 'warning',
            message: `Skill "${skill.name}" is a duplicate (symlink) and will be skipped`,
            path: skill.filePath,
          });
          continue;
        }
        realPathSet.add(realPath);
      } catch (err) {
        this.diagnostics.push({
          type: 'warning',
          message: `Failed to resolve realpath for "${skill.filePath}": ${(err as Error).message}`,
          path: skill.filePath,
        });
        // Continue processing this skill even if realpath fails
      }

      // Later wins: same-name overrides
      const existing = this.skillMap.get(skill.name);
      if (existing) {
        this.diagnostics.push({
          type: 'collision',
          message: `Skill "${skill.name}" from ${skill.source} overrides ${existing.source}`,
          path: skill.filePath,
          collision: {
            name: skill.name,
            winnerPath: skill.filePath,
            loserPath: existing.filePath,
          },
        });
      }
      this.skillMap.set(skill.name, skill);
    }
  }

  getSkills(): Skill[] {
    return Array.from(this.skillMap.values());
  }

  getSkillByName(name: string): Skill | undefined {
    return this.skillMap.get(name);
  }

  getDiagnostics(): SkillDiagnostic[] {
    return this.diagnostics;
  }
}
