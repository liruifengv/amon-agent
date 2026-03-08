import type { Skill } from '@shared/types';
import { escapeXml, compactPath } from './utils';

/**
 * Format skills list into a system prompt section.
 * Skills with disableModelInvocation=true or in disabledSkills are excluded.
 * Returns empty string if no eligible skills.
 */
export function formatSkillsForPrompt(
  skills: Skill[],
  disabledSkills: string[] = [],
): string {
  const eligible = skills.filter(
    s => !s.disableModelInvocation && !disabledSkills.includes(s.name),
  );
  if (eligible.length === 0) return '';

  const skillEntries = eligible.map(s =>
    `  <skill>
    <name>${escapeXml(s.name)}</name>
    <description>${escapeXml(s.description)}</description>
    <location>${escapeXml(compactPath(s.filePath))}</location>
  </skill>`
  ).join('\n');

  return `## Skills

The following skills provide specialized instructions for specific tasks.
Use the Read tool to load a skill's file when the task matches its description.
When a skill file references a relative path, resolve it against the skill directory.

<available_skills>
${skillEntries}
</available_skills>`;
}
