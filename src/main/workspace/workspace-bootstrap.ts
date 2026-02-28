import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { getTemplatesDir } from '../runtime/bundledPaths';

/** 固定的系统级 workspace 目录 */
const WORKSPACE_DIR = join(homedir(), '.amon', 'workspace');

/** Bootstrap 文件名常量 */
export const BOOTSTRAP_FILENAMES = {
  AGENTS: 'AGENTS.md',
  SOUL: 'SOUL.md',
  BOOTSTRAP: 'BOOTSTRAP.md',
} as const;

export type BootstrapFileName = (typeof BOOTSTRAP_FILENAMES)[keyof typeof BOOTSTRAP_FILENAMES];

/** 常驻文件（每次 seed 检查） */
const PERSISTENT_FILES: BootstrapFileName[] = [
  BOOTSTRAP_FILENAMES.AGENTS,
  BOOTSTRAP_FILENAMES.SOUL,
];

/** 临时文件（仅新 workspace seed） */
const ONBOARDING_FILES: BootstrapFileName[] = [
  BOOTSTRAP_FILENAMES.BOOTSTRAP,
];

/** 所有 bootstrap 文件（读取顺序） */
const ALL_FILES: BootstrapFileName[] = [...PERSISTENT_FILES, ...ONBOARDING_FILES];

/** 加载后的 workspace 文件 */
export interface WorkspaceBootstrapFile {
  name: BootstrapFileName;
  path: string;
  content: string;
}

// 模板内容缓存
const templateCache = new Map<string, string>();

async function loadTemplate(name: string): Promise<string | null> {
  const cached = templateCache.get(name);
  if (cached !== undefined) return cached;

  try {
    const templatePath = join(getTemplatesDir(), name);
    const content = await readFile(templatePath, 'utf-8');
    templateCache.set(name, content);
    return content;
  } catch {
    return null;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeFileIfMissing(path: string, content: string): Promise<boolean> {
  try {
    await writeFile(path, content, { flag: 'wx' });
    return true;
  } catch {
    // File already exists or write failed
    return false;
  }
}

/**
 * 确保 ~/.amon/workspace/ 中有 bootstrap 文件。
 * 常驻文件（AGENTS.md、SOUL.md）：不存在则从模板种子。
 * 临时文件（BOOTSTRAP.md）：仅在 workspace 完全为新时种子。
 */
export async function ensureBootstrapFiles(): Promise<BootstrapFileName[]> {
  try {
    await mkdir(WORKSPACE_DIR, { recursive: true });
  } catch {
    return [];
  }

  // 检查是否为全新 workspace（所有文件都不存在）
  const existenceChecks = await Promise.all(
    ALL_FILES.map(name => fileExists(join(WORKSPACE_DIR, name))),
  );
  const isNewWorkspace = existenceChecks.every(exists => !exists);

  const seeded: BootstrapFileName[] = [];

  // 种子常驻文件
  for (const name of PERSISTENT_FILES) {
    const template = await loadTemplate(name);
    if (!template) continue;

    const filePath = join(WORKSPACE_DIR, name);
    if (await writeFileIfMissing(filePath, template)) {
      seeded.push(name);
    }
  }

  // 仅新 workspace 种子 BOOTSTRAP.md
  if (isNewWorkspace) {
    for (const name of ONBOARDING_FILES) {
      const template = await loadTemplate(name);
      if (!template) continue;

      const filePath = join(WORKSPACE_DIR, name);
      if (await writeFileIfMissing(filePath, template)) {
        seeded.push(name);
      }
    }
  }

  if (seeded.length > 0) {
    console.log(`[workspace-bootstrap] Seeded files: ${seeded.join(', ')}`);
  }

  return seeded;
}

/**
 * 加载 ~/.amon/workspace/ 中已存在的 bootstrap 文件。
 * 跳过不存在的文件，返回已读取到的文件列表。
 */
export async function loadWorkspaceBootstrapFiles(): Promise<WorkspaceBootstrapFile[]> {
  const files: WorkspaceBootstrapFile[] = [];

  for (const name of ALL_FILES) {
    const filePath = join(WORKSPACE_DIR, name);
    try {
      const content = await readFile(filePath, 'utf-8');
      files.push({ name, path: filePath, content });
    } catch {
      // File doesn't exist, skip
    }
  }

  return files;
}

/**
 * 删除 BOOTSTRAP.md 文件。不存在时静默返回。
 */
export async function removeBootstrapFile(): Promise<void> {
  const { unlink } = await import('fs/promises');
  const filePath = join(WORKSPACE_DIR, BOOTSTRAP_FILENAMES.BOOTSTRAP);
  try {
    await unlink(filePath);
  } catch {
    // File doesn't exist, ignore
  }
}
