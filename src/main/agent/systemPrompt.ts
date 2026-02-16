/**
 * System prompt construction for Amon Agent.
 * Reference: pi-coding-agent/src/core/system-prompt.ts
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/** Tool descriptions for system prompt */
const toolDescriptions: Record<string, string> = {
  read: 'Read file contents (supports line ranges)',
  write: 'Create or overwrite files',
  edit: 'Make precise text replacements in files',
  bash: 'Execute shell commands',
  glob: 'Find files by glob pattern (respects .gitignore)',
  grep: 'Search file contents for patterns (respects .gitignore)',
};

export interface BuildAmonSystemPromptOptions {
  /** Working directory */
  cwd: string;
  /** Enabled tool names */
  tools: string[];
  /** User custom prompt from Settings (appended) */
  customPrompt?: string;
}

/**
 * Build the Amon agent system prompt.
 *
 * Structure:
 * 1. Role and capabilities
 * 2. Available tools
 * 3. Guidelines
 * 4. Workspace SYSTEM_PROMPT.md (if exists)
 * 5. User custom prompt (from Settings)
 * 6. Date/time and working directory
 */
export function buildAmonSystemPrompt(options: BuildAmonSystemPromptOptions): string {
  const { cwd, tools, customPrompt } = options;

  const now = new Date();
  const dateTime = now.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });

  // Build tools list (only known tools)
  const knownTools = tools.filter((t) => t in toolDescriptions);
  const toolsList =
    knownTools.length > 0
      ? knownTools.map((t) => `- ${t}: ${toolDescriptions[t]}`).join('\n')
      : '(none)';

  // Build guidelines based on available tools
  const guidelines: string[] = [];

  const hasRead = knownTools.includes('read');
  const hasEdit = knownTools.includes('edit');
  const hasWrite = knownTools.includes('write');
  const hasBash = knownTools.includes('bash');
  const hasGrep = knownTools.includes('grep');
  const hasGlob = knownTools.includes('glob');

  if (hasRead && hasEdit) {
    guidelines.push('Read files before editing to understand existing code');
  }
  if (hasEdit) {
    guidelines.push('Use edit for precise changes (old text must match exactly)');
  }
  if (hasWrite) {
    guidelines.push('Use write only for new files or complete rewrites');
  }
  if (hasBash && (hasGrep || hasGlob)) {
    guidelines.push(
      'Prefer grep/glob tools over bash for file search (faster, respects .gitignore)'
    );
  }
  guidelines.push('Be concise in responses');
  guidelines.push('Show file paths clearly when working with files');

  const guidelinesText = guidelines.map((g) => `- ${g}`).join('\n');

  let prompt = `You are an expert coding assistant. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
${toolsList}

Guidelines:
${guidelinesText}`;

  // Load workspace-level system prompt (.amon/SYSTEM_PROMPT.md)
  const workspacePromptPath = join(cwd, '.amon', 'SYSTEM_PROMPT.md');
  if (existsSync(workspacePromptPath)) {
    try {
      const workspacePrompt = readFileSync(workspacePromptPath, 'utf-8').trim();
      if (workspacePrompt) {
        prompt += `\n\n# Workspace Instructions\n\n${workspacePrompt}`;
      }
    } catch {
      // Ignore read errors
    }
  }

  // Append user custom prompt from Settings
  if (customPrompt?.trim()) {
    prompt += `\n\n# Custom Instructions\n\n${customPrompt.trim()}`;
  }

  // Add date/time and working directory last
  prompt += `\n\nCurrent date and time: ${dateTime}`;
  prompt += `\nCurrent working directory: ${cwd}`;

  return prompt;
}
