import os from 'node:os';
import { app } from 'electron';
import { DEFAULT_SYSTEM_PROMPT } from '@shared/constants';
import type { Tool } from '@shared/tool-types';

export interface SystemPromptOptions {
  workspace: string;
  tools: Tool[];
  skillsPrompt?: string;
  customInstructions?: string;
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

  return parts.join('\n\n');
}
