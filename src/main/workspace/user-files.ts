import { readFile } from 'fs/promises';
import { join } from 'path';

/** 用户可放置的自定义文件名 */
const USER_FILE_NAMES = ['AGENTS.md', 'SOUL.md'] as const;

/** 加载后的用户文件 */
export interface UserFile {
  name: string;
  path: string;
  content: string;
}

/**
 * 加载 ~/.amon/ 中用户放置的自定义文件（AGENTS.md、SOUL.md）。
 * 不会自动创建任何文件——仅在文件已存在时加载。
 */
export async function loadGlobalUserFiles(dataDir: string): Promise<UserFile[]> {
  const files: UserFile[] = [];

  for (const name of USER_FILE_NAMES) {
    const filePath = join(dataDir, name);
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
 * 从项目根目录加载 AGENTS.md。
 * 如果 workspace 就是默认全局工作空间则跳过（避免与全局文件重复）。
 */
export async function loadProjectAgentsFile(
  workspace: string,
  defaultWorkspace: string,
): Promise<UserFile | null> {
  if (workspace === defaultWorkspace) return null;

  const filePath = join(workspace, 'AGENTS.md');
  try {
    const content = await readFile(filePath, 'utf-8');
    return { name: 'AGENTS.md', path: filePath, content };
  } catch {
    return null;
  }
}
