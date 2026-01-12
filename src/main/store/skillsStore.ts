import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { app } from 'electron';
import { getSettings } from './configStore';
import type { Skill, SkillMetadata, SkillSource, SkillsLoadResult, WorkspaceSkills, RecommendedSkill, SkillInstallTarget } from '../../shared/types';

// 系统级 skills 目录：~/.claude/skills
const SYSTEM_SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');

/**
 * 获取内置 skills 资源目录路径
 * 开发环境: project/resources/skills
 * 打包环境: app.asar.unpacked/resources/skills 或 resources/skills
 */
function getBundledSkillsDir(): string {
  if (app.isPackaged) {
    // 打包后的路径
    return path.join(process.resourcesPath, 'skills');
  } else {
    // 开发环境路径
    return path.join(process.cwd(), 'resources', 'skills');
  }
}

/**
 * 解析 SKILL.md 的 frontmatter
 * frontmatter 格式：
 * ---
 * name: skill-name
 * description: skill description
 * license: optional license
 * ---
 */
function parseFrontmatter(content: string): SkillMetadata | null {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return null;
  }

  const frontmatterContent = match[1];
  const metadata: Record<string, string> = {};

  // 解析 YAML 格式的 frontmatter
  const lines = frontmatterContent.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      // 移除引号
      metadata[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  // 验证必需字段
  if (!metadata.name || !metadata.description) {
    return null;
  }

  return {
    name: metadata.name,
    description: metadata.description,
    license: metadata.license,
  };
}

/**
 * 加载单个 skill
 */
async function loadSkill(skillDir: string, source: SkillSource): Promise<Skill | null> {
  const skillMdPath = path.join(skillDir, 'SKILL.md');

  try {
    // 检查 SKILL.md 是否存在
    await fs.access(skillMdPath);

    // 读取并解析 SKILL.md
    const content = await fs.readFile(skillMdPath, 'utf-8');
    const metadata = parseFrontmatter(content);

    if (!metadata) {
      console.warn(`Invalid SKILL.md in ${skillDir}: missing or invalid frontmatter`);
      return null;
    }

    // 生成唯一 ID（基于路径）
    const id = `${source.type}:${metadata.name}`;

    return {
      id,
      metadata,
      path: skillDir,
      skillMdPath,
      source,
    };
  } catch {
    // SKILL.md 不存在或读取失败
    return null;
  }
}

/**
 * 加载目录下的所有 skills
 */
async function loadSkillsFromDir(skillsDir: string, source: SkillSource): Promise<Skill[]> {
  const skills: Skill[] = [];

  try {
    // 检查目录是否存在
    await fs.access(skillsDir);

    // 读取目录内容
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });

    // 遍历所有子目录
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillDir = path.join(skillsDir, entry.name);
        const skill = await loadSkill(skillDir, source);
        if (skill) {
          skills.push(skill);
        }
      }
    }
  } catch {
    // 目录不存在，返回空数组
  }

  return skills;
}

/**
 * 加载系统级 skills
 */
export async function loadSystemSkills(): Promise<Skill[]> {
  const source: SkillSource = { type: 'system' };
  return loadSkillsFromDir(SYSTEM_SKILLS_DIR, source);
}

/**
 * 加载工作空间的 skills
 */
export async function loadWorkspaceSkills(workspacePath: string, workspaceName: string): Promise<Skill[]> {
  const skillsDir = path.join(workspacePath, '.claude', 'skills');
  const source: SkillSource = {
    type: 'workspace',
    workspacePath,
    workspaceName,
  };
  return loadSkillsFromDir(skillsDir, source);
}

/**
 * 加载所有 skills（系统级 + 所有工作空间）
 */
export async function loadAllSkills(): Promise<SkillsLoadResult> {
  // 加载系统级 skills
  const systemSkills = await loadSystemSkills();

  // 获取设置中的工作空间列表
  const settings = await getSettings();
  const workspaces = settings.workspaces || [];

  // 加载各工作空间的 skills
  const workspaceSkillsPromises = workspaces.map(async (workspace): Promise<WorkspaceSkills> => {
    // 展开 ~ 为 home 目录
    const expandedPath = workspace.path.startsWith('~')
      ? path.join(os.homedir(), workspace.path.slice(1))
      : workspace.path;

    const skills = await loadWorkspaceSkills(expandedPath, workspace.name);
    return {
      workspacePath: workspace.path,
      workspaceName: workspace.name,
      skills,
    };
  });

  const workspaceSkills = await Promise.all(workspaceSkillsPromises);

  return {
    systemSkills,
    workspaceSkills,
  };
}

/**
 * 获取系统 skills 目录路径
 */
export function getSystemSkillsDir(): string {
  return SYSTEM_SKILLS_DIR;
}

/**
 * 从内置资源获取推荐 skills 列表
 */
export async function listRecommendedSkills(): Promise<RecommendedSkill[]> {
  const recommended: RecommendedSkill[] = [];
  const bundledDir = getBundledSkillsDir();

  try {
    // 检查内置 skills 目录是否存在
    await fs.access(bundledDir);

    // 读取目录内容
    const entries = await fs.readdir(bundledDir, { withFileTypes: true });

    // 先加载已安装的 skills 用于检查安装状态
    const installedSkills = await loadAllSkills();
    const installedSystemNames = new Set(installedSkills.systemSkills.map(s => s.metadata.name));
    const installedWorkspaceMap = new Map<string, string>(); // skill name -> workspace name

    for (const ws of installedSkills.workspaceSkills) {
      for (const skill of ws.skills) {
        installedWorkspaceMap.set(skill.metadata.name, ws.workspaceName);
      }
    }

    // 遍历所有子目录
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillDir = path.join(bundledDir, entry.name);
        const skillMdPath = path.join(skillDir, 'SKILL.md');

        try {
          const content = await fs.readFile(skillMdPath, 'utf-8');
          const metadata = parseFrontmatter(content);

          if (metadata) {
            // 检查是否已安装
            const isInstalledSystem = installedSystemNames.has(metadata.name);
            const installedWorkspace = installedWorkspaceMap.get(metadata.name);

            recommended.push({
              id: `bundled:${metadata.name}`,
              metadata,
              repoPath: entry.name, // 使用目录名作为路径
              installed: isInstalledSystem || !!installedWorkspace,
              installedAt: isInstalledSystem ? 'system' : (installedWorkspace ? 'workspace' : undefined),
              installedWorkspace: installedWorkspace,
            });
          }
        } catch {
          console.warn(`Failed to load bundled skill: ${entry.name}`);
        }
      }
    }
  } catch (error) {
    console.error('Failed to load bundled skills:', error);
  }

  return recommended;
}

/**
 * 递归复制目录
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });

  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * 安装推荐的 skill（从内置资源复制）
 */
export async function installSkill(
  skillId: string,
  target: SkillInstallTarget,
  workspacePath?: string
): Promise<void> {
  // 获取推荐 skills 列表找到要安装的 skill
  const recommended = await listRecommendedSkills();
  const skill = recommended.find(s => s.id === skillId);

  if (!skill) {
    throw new Error(`Skill not found: ${skillId}`);
  }

  // 确定源目录（内置资源）
  const bundledDir = getBundledSkillsDir();
  const sourceDir = path.join(bundledDir, skill.repoPath);

  // 确定目标目录
  let targetDir: string;

  if (target === 'system') {
    targetDir = path.join(SYSTEM_SKILLS_DIR, skill.metadata.name);
  } else if (target === 'workspace' && workspacePath) {
    // 展开 ~ 为 home 目录
    const expandedPath = workspacePath.startsWith('~')
      ? path.join(os.homedir(), workspacePath.slice(1))
      : workspacePath;
    targetDir = path.join(expandedPath, '.claude', 'skills', skill.metadata.name);
  } else {
    throw new Error('Workspace path is required for workspace installation');
  }

  // 检查目标是否已存在
  try {
    await fs.access(targetDir);
    throw new Error(`Skill already exists at ${targetDir}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  // 从内置资源复制 skill 目录
  await copyDir(sourceDir, targetDir);
}

/**
 * 递归删除目录
 */
async function removeDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

/**
 * 卸载 skill
 */
export async function uninstallSkill(skillPath: string): Promise<void> {
  // 检查路径是否存在
  try {
    await fs.access(skillPath);
  } catch {
    throw new Error(`Skill not found at ${skillPath}`);
  }

  // 安全检查：确保路径在合法的 skills 目录下
  const isSystemSkill = skillPath.startsWith(SYSTEM_SKILLS_DIR);
  const isWorkspaceSkill = skillPath.includes('.claude/skills/');

  if (!isSystemSkill && !isWorkspaceSkill) {
    throw new Error('Invalid skill path');
  }

  // 删除目录
  await removeDir(skillPath);
}
