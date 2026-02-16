import type { Tool } from '@shared/tool-types';
import { DEFAULT_SYSTEM_PROMPT } from '@shared/constants';

interface SystemPromptConfig {
  workspace?: string;
  tools: Tool[];
}

export function buildSystemPrompt(config: SystemPromptConfig): string {
  const parts: string[] = [DEFAULT_SYSTEM_PROMPT];

  if (config.workspace) {
    parts.push(`\n# Environment\n\nCurrent working directory: ${config.workspace}`);
  }

  if (config.tools.length > 0) {
    const toolList = config.tools
      .map(t => `- **${t.name}**: ${t.description}`)
      .join('\n');
    parts.push(`\n# Available Tools\n\n${toolList}`);
  }

  return parts.join('\n');
}
