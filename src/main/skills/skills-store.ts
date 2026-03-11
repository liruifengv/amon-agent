import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import type { Skill, SkillDiagnostic, SkillsLoadResult, BuiltinSkillMeta } from '@shared/types';
import type { ConfigStore } from '../store/config-store';
import { loadSkillsFromDir } from './skills-loader';
import { parseFrontmatter } from './frontmatter';
import { createLogger } from '../store/logger';

const log = createLogger('SkillsStore');

/** Entry in skills/index.json */
interface BuiltinSkillEntry {
  name: string;
  defaultInstall: boolean;
}

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

  /** Invalidate cache so next load() re-scans the file system */
  invalidateCache(): void {
    this.cachedWorkspace = null;
    this.skillMap.clear();
  }

  /** Get the built-in skills directory path (handles asar packaging) */
  private getBuiltinSkillsDir(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'skills');
    }
    return path.join(app.getAppPath(), 'skills');
  }

  /** Read the built-in skills index */
  private readBuiltinIndex(): BuiltinSkillEntry[] {
    try {
      const indexPath = path.join(this.getBuiltinSkillsDir(), 'index.json');
      const raw = fs.readFileSync(indexPath, 'utf-8');
      return JSON.parse(raw) as BuiltinSkillEntry[];
    } catch (err) {
      log.error(`Failed to read built-in skills index: ${(err as Error).message}`);
      return [];
    }
  }

  /** Get built-in skill metadata list (from skills/index.json) */
  getBuiltinSkills(): BuiltinSkillMeta[] {
    const entries = this.readBuiltinIndex();
    const builtinDir = this.getBuiltinSkillsDir();
    const installedDir = path.join(os.homedir(), '.amon', 'skills');

    return entries.map(entry => {
      let description = '';
      try {
        const skillFile = path.join(builtinDir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          const content = fs.readFileSync(skillFile, 'utf-8');
          const { frontmatter } = parseFrontmatter(content);
          description = frontmatter.description || '';
        }
      } catch {
        // Ignore read errors
      }

      const installed = fs.existsSync(path.join(installedDir, entry.name, 'SKILL.md'));

      return {
        name: entry.name,
        description,
        installed,
        defaultInstall: entry.defaultInstall,
        dirPath: path.join(builtinDir, entry.name),
      };
    });
  }

  /** Install a built-in skill: copy skills/<name> to ~/.amon/skills/<name> */
  async installBuiltinSkill(name: string): Promise<void> {
    const entries = this.readBuiltinIndex();
    const exists = entries.some(e => e.name === name);
    if (!exists) {
      throw new Error(`Built-in skill "${name}" not found in index`);
    }

    const srcDir = path.join(this.getBuiltinSkillsDir(), name);
    const destDir = path.join(os.homedir(), '.amon', 'skills', name);

    // Idempotent: skip if already installed
    if (fs.existsSync(destDir)) {
      log.info(`Skill "${name}" already installed, skipping`);
      return;
    }

    // Ensure parent directory exists
    await fs.promises.mkdir(path.join(os.homedir(), '.amon', 'skills'), { recursive: true });

    // Copy recursively
    await fs.promises.cp(srcDir, destDir, { recursive: true });
    log.info(`Installed built-in skill: ${name}`);

    this.invalidateCache();
  }

  /** Uninstall a skill: delete ~/.amon/skills/<name> directory */
  async uninstallSkill(name: string): Promise<void> {
    const destDir = path.join(os.homedir(), '.amon', 'skills', name);

    // Silent return if not found
    if (!fs.existsSync(destDir)) {
      log.info(`Skill "${name}" not found for uninstall, skipping`);
      return;
    }

    // Safety: only allow deleting from ~/.amon/skills/
    const skillsRoot = path.join(os.homedir(), '.amon', 'skills');
    const resolved = path.resolve(destDir);
    if (!resolved.startsWith(skillsRoot)) {
      throw new Error(`Cannot uninstall skill outside of ${skillsRoot}`);
    }

    await fs.promises.rm(destDir, { recursive: true, force: true });
    log.info(`Uninstalled skill: ${name}`);

    this.invalidateCache();
  }

  /** Read SKILL.md content from a given path */
  readSkillContent(skillFilePath: string): string {
    try {
      return fs.readFileSync(skillFilePath, 'utf-8');
    } catch (err) {
      log.error(`Failed to read skill content: ${(err as Error).message}`);
      return '';
    }
  }

  /** First-time initialization: install defaultInstall=true built-in skills */
  async initializeBuiltinSkills(): Promise<void> {
    const settings = await this.configStore.getSettings();
    if (settings.skills.initialized) {
      return;
    }

    log.info('First launch: installing default built-in skills...');
    const entries = this.readBuiltinIndex();
    const defaultSkills = entries.filter(e => e.defaultInstall);

    await Promise.all(
      defaultSkills.map(entry => this.installBuiltinSkill(entry.name))
    );

    // Mark as initialized
    await this.configStore.updateSettings({
      skills: { ...settings.skills, initialized: true },
    });

    log.info(`First-launch skill installation complete (${defaultSkills.length} skills installed)`);
  }
}
