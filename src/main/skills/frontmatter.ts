import { parse as parseYaml } from 'yaml';
import type { SkillFrontmatter } from '@shared/types';

export interface ParsedSkillFile {
  frontmatter: SkillFrontmatter;
  body: string;
}

/**
 * Parse YAML frontmatter from SKILL.md content.
 * Returns empty frontmatter + full body on failure.
 */
export function parseFrontmatter(content: string): ParsedSkillFile {
  // Normalize line endings
  const text = content.replace(/\r\n/g, '\n');

  if (!text.startsWith('---')) {
    return { frontmatter: {}, body: text };
  }

  const endIndex = text.indexOf('\n---', 3);
  if (endIndex === -1) {
    return { frontmatter: {}, body: text };
  }

  const yamlStr = text.slice(3, endIndex).trim();
  const body = text.slice(endIndex + 4).trim();

  try {
    const parsed = parseYaml(yamlStr);
    if (parsed && typeof parsed === 'object') {
      return { frontmatter: parsed as SkillFrontmatter, body };
    }
    return { frontmatter: {}, body };
  } catch {
    return { frontmatter: {}, body: text };
  }
}
