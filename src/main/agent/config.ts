import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { app } from 'electron';
import type { Settings } from '../../shared/schemas';
import { createRequire } from 'node:module';

const requireModule = createRequire(import.meta.url);

/**
 * 解析 Claude Code CLI 路径
 * 支持打包后和开发环境
 */
export function resolveClaudeCodeCli(): string {
  const cliPath = requireModule.resolve('@anthropic-ai/claude-agent-sdk/cli.js');
  if (cliPath.includes('app.asar')) {
    const unpackedPath = cliPath.replace('app.asar', 'app.asar.unpacked');
    if (existsSync(unpackedPath)) {
      return unpackedPath;
    }
  }
  return cliPath;
}


/**
 * 获取打包的 bun 可执行文件路径
 */
export function getBundledBunPath(): string {
  const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL;
  const bunName = process.platform === 'win32' ? 'bun.exe' : 'bun';

  if (isDev) {
    return join(app.getAppPath(), 'resources', bunName);
  } else {
    return join(process.resourcesPath, bunName);
  }
}

/**
 * 获取打包的 uv 可执行文件路径（Python 包管理器）
 */
export function getBundledUvPath(): string {
  const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL;
  const uvName = process.platform === 'win32' ? 'uv.exe' : 'uv';

  if (isDev) {
    return join(app.getAppPath(), 'resources', uvName);
  } else {
    return join(process.resourcesPath, uvName);
  }
}

/**
 * 获取打包的 Git 目录路径（仅 Windows）
 */
export function getBundledGitPath(): string | null {
  if (process.platform !== 'win32') {
    return null;
  }

  const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL;
  if (isDev) {
    return join(app.getAppPath(), 'resources', 'git-portable');
  } else {
    return join(process.resourcesPath, 'git-portable');
  }
}

/**
 * 获取打包的 MSYS2 目录路径（仅 Windows）
 * MSYS2 提供 bash, awk, sed 等 unix 工具
 */
export function getBundledMsys2Path(): string | null {
  if (process.platform !== 'win32') {
    return null;
  }

  const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL;
  if (isDev) {
    return join(app.getAppPath(), 'resources', 'msys2');
  } else {
    return join(process.resourcesPath, 'msys2');
  }
}

/**
 * 检查 bash.exe 路径是否来自 MSYS2
 * MSYS2 bash 需要特殊的环境变量才能正确继承 Windows 环境变量
 */
export function isMsys2Bash(bashExePath: string | null): boolean {
  if (!bashExePath || process.platform !== 'win32') {
    return false;
  }

  const normalizedPath = resolve(bashExePath).toLowerCase();

  // 检查是否是打包的 MSYS2 bash
  const bundledMsys2Path = getBundledMsys2Path();
  if (bundledMsys2Path) {
    const msys2BashExe = resolve(join(bundledMsys2Path, 'usr', 'bin', 'bash.exe')).toLowerCase();
    if (normalizedPath === msys2BashExe) {
      return true;
    }
  }

  // 检查路径是否包含 'msys2' 或 'msys64'
  return normalizedPath.includes('msys2') || normalizedPath.includes('msys64');
}

/**
 * 查找 Windows 上的 bash.exe 路径
 * 按顺序检查：打包的 Git、打包的 MSYS2、系统 Git
 */
export function getBashExePath(): string | null {
  if (process.platform !== 'win32') {
    return null;
  }

  // 1. 检查打包的 Git
  const bundledGitPath = getBundledGitPath();
  if (bundledGitPath) {
    const gitBashExe = join(bundledGitPath, 'usr', 'bin', 'bash.exe');
    if (existsSync(gitBashExe)) {
      return resolve(gitBashExe);
    }
  }

  // 2. 检查打包的 MSYS2
  const bundledMsys2Path = getBundledMsys2Path();
  if (bundledMsys2Path) {
    const msys2BashExe = join(bundledMsys2Path, 'usr', 'bin', 'bash.exe');
    if (existsSync(msys2BashExe)) {
      return resolve(msys2BashExe);
    }
  }

  // 3. 检查常见的系统 Git 安装路径
  const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
  const programFilesX86 =
    process.env['ProgramFiles(x86)'] || process.env.PROGRAMFILES_X86 || 'C:\\Program Files (x86)';

  const commonGitPaths = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    join(programFiles, 'Git', 'bin', 'bash.exe'),
    join(programFilesX86, 'Git', 'bin', 'bash.exe'),
  ];

  for (const gitBashPath of commonGitPaths) {
    if (existsSync(gitBashPath)) {
      return resolve(gitBashPath);
    }
  }

  // 4. 检查 PATH 中是否有 bash.exe
  const pathEntries = (process.env.PATH || '').split(';');
  for (const pathEntry of pathEntries) {
    const bashExe = join(pathEntry.trim(), 'bash.exe');
    if (existsSync(bashExe)) {
      return resolve(bashExe);
    }
  }

  return null;
}

/**
 * 构建增强的 PATH，包含所有打包的工具
 * 确保打包的工具优先于系统安装的版本
 */
export function buildEnhancedPath(): string {
  const pathSeparator = process.platform === 'win32' ? ';' : ':';

  // 收集所有打包的二进制文件目录
  const bundledBinDirs: string[] = [
    resolve(dirname(getBundledBunPath())),
    resolve(dirname(getBundledUvPath())),
  ];

  // 添加 Git 路径（仅 Windows）
  const bundledGitPath = getBundledGitPath();
  if (bundledGitPath) {
    const gitPaths = ['bin', 'mingw64/bin', 'cmd']
      .map((subpath) => resolve(join(bundledGitPath, subpath)))
      .filter((p) => existsSync(p));
    bundledBinDirs.push(...gitPaths);
  }

  // 添加 MSYS2 路径（仅 Windows）
  const bundledMsys2Path = getBundledMsys2Path();
  if (bundledMsys2Path) {
    const msys2Paths = ['usr/bin', 'mingw64/bin']
      .map((subpath) => resolve(join(bundledMsys2Path, subpath)))
      .filter((p) => existsSync(p));
    bundledBinDirs.push(...msys2Paths);
  }

  // 规范化路径用于比较（Windows 不区分大小写）
  const normalize = (p: string): string => {
    const normalized = resolve(p);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  };

  const bundledPathsSet = new Set(bundledBinDirs.map(normalize));

  // 过滤用户 PATH 中的重复项
  const userPathEntries = (process.env.PATH || '').split(pathSeparator).filter((entry) => {
    const trimmed = entry.trim();
    return trimmed && !bundledPathsSet.has(normalize(trimmed));
  });

  // 组合：打包的工具优先，然后是用户 PATH
  return [...bundledBinDirs, ...userPathEntries].join(pathSeparator);
}

/**
 * 构建 Claude Agent SDK 查询会话使用的完整环境变量对象
 *
 * 环境变量包括：
 * - 所有 process.env 变量
 * - PATH（增强后包含打包的工具）
 * - CLAUDE_CODE_GIT_BASH_PATH（仅 Windows，如果找到 bash.exe）
 * - MSYSTEM, MSYS2_PATH_TYPE, HOME（仅 Windows 且使用 MSYS2 bash 时）
 * - ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, CLAUDE_MODEL（如果设置中配置了）
 */
export function buildClaudeSessionEnv(workspaceDir?: string, settings?: Settings): Record<string, string> {
  const enhancedPath = buildEnhancedPath();

  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => v !== undefined) as [string, string][]
    ),
    PATH: enhancedPath,
  };

  // 只有关闭 Claude Code 模式时才传递 API 配置（让 SDK 使用自己的配置）
  if (settings?.agent && !settings.agent.claudeCodeMode) {
    // 从 Provider 列表中获取当前激活的 Provider
    const { providers, activeProviderId } = settings.agent;
    const activeProvider = providers?.find(p => p.id === activeProviderId);

    console.log('Active Provider for Claude Session Env:', activeProvider);

    if (activeProvider) {
      env.ANTHROPIC_API_KEY = activeProvider.apiKey;
      env.ANTHROPIC_BASE_URL = activeProvider.apiUrl;
      env.ANTHROPIC_MODEL = activeProvider.model;
    }
  }

  // Windows 特定配置
  if (process.platform === 'win32') {
    const bashExePath = getBashExePath();
    if (bashExePath) {
      env.CLAUDE_CODE_GIT_BASH_PATH = bashExePath;

      // MSYS2 bash 需要特殊环境变量才能正确继承 Windows 环境变量和 PATH
      if (isMsys2Bash(bashExePath)) {
        env.MSYSTEM = 'MSYS';
        env.MSYS2_PATH_TYPE = 'inherit';
        if (workspaceDir) {
          env.HOME = resolve(workspaceDir);
        }
      }
    }
  }

  return env;
}
