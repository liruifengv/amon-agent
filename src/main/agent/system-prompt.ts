import os from 'node:os';
import { app } from 'electron';
import { DEFAULT_SYSTEM_PROMPT } from '@shared/constants';
import type { Tool } from '../tools/types';
import type { UserFile } from '../workspace/user-files';

export interface SystemPromptOptions {
  workspace: string;
  tools: Tool[];
  skillsPrompt?: string;
  customInstructions?: string;
  globalUserFiles?: UserFile[];
  projectAgentsFile?: UserFile;
}

function buildToolsSection(tools: Tool[]): string {
  const lines = [
    '## Available Tools',
    '',
    'You can use the following tools:',
    '',
  ];

  for (const tool of tools) {
    lines.push(`- **${tool.name}**: ${tool.description}`);
  }

  lines.push('');
  lines.push('## Tool Guidelines');

  const hasRead = tools.some(t => t.name === 'Read');
  const hasEdit = tools.some(t => t.name === 'Edit');
  const hasGlob = tools.some(t => t.name === 'Glob');
  const hasGrep = tools.some(t => t.name === 'Grep');
  const hasBash = tools.some(t => t.name === 'Bash');

  if (hasRead && hasEdit) {
    lines.push('- Use Read to examine files before editing them');
  }
  if (hasGlob) {
    lines.push('- Use Glob to find files matching patterns (e.g., "**/*.ts")');
  }
  if (hasGrep) {
    lines.push('- Use Grep to search for text patterns in files');
  }
  if (hasBash && (hasGlob || hasGrep)) {
    lines.push('- Prefer Glob/Grep over Bash commands (ls/find) when possible');
  }

  return lines.join('\n');
}

function buildEnvironmentSection(workspace: string): string {
  return [
    '## Environment',
    '',
    '<environment_context>',
    `  <cwd>${escapeXml(workspace)}</cwd>`,
    `  <home>${escapeXml(os.homedir())}</home>`,
    `  <shell>${process.env.SHELL || 'bash'}</shell>`,
    `  <os>${process.platform}</os>`,
    `  <amon_version>${app.getVersion()}</amon_version>`,
    `  <date>${new Date().toISOString().split('T')[0]}</date>`,
    '</environment_context>',
  ].join('\n');
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildUserFilesSection(files: UserFile[]): string {
  if (files.length === 0) return '';

  const hasSoulFile = files.some(f => f.name === 'SOUL.md');
  const lines = [
    '# User Context',
    '',
  ];

  if (hasSoulFile) {
    lines.push(
      'If SOUL.md is present, embody its persona and tone. Follow its guidance unless higher-priority instructions override it.',
      '',
    );
  }

  for (const file of files) {
    lines.push(`## ${file.name}`, '', file.content, '');
  }

  return lines.join('\n');
}

function buildProjectInstructions(file: UserFile): string {
  return [
    '# Project Instructions',
    '',
    `Source: ${file.path}`,
    '',
    file.content,
  ].join('\n');
}

export function buildSystemPrompt(options: SystemPromptOptions): string {
  const parts = [
    DEFAULT_SYSTEM_PROMPT,
    buildToolsSection(options.tools),
    buildEnvironmentSection(options.workspace),
  ];

  if (options.skillsPrompt) {
    parts.push(options.skillsPrompt);
  }

  if (options.customInstructions) {
    parts.push('## Custom Instructions');
    parts.push(options.customInstructions);
  }

  // 全局用户文件（~/.amon/AGENTS.md, SOUL.md）
  if (options.globalUserFiles && options.globalUserFiles.length > 0) {
    parts.push(buildUserFilesSection(options.globalUserFiles));
  }

  // 项目级 AGENTS.md 放在最末尾（最高优先级）
  if (options.projectAgentsFile) {
    parts.push(buildProjectInstructions(options.projectAgentsFile));
  }

  return parts.join('\n\n');
}
