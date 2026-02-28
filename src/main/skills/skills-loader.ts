import fs from 'node:fs';
import path from 'node:path';
import type { Skill, SkillDiagnostic, SkillSource, SkillsLoadResult } from '@shared/types';
import { parseFrontmatter } from './frontmatter';
import { validateSkillName, validateSkillDescription } from './utils';

interface LoadOptions {
  dir: string;
  source: SkillSource;
}

/**
 * Load skills from a directory.
 * Each subdirectory should contain a SKILL.md file with YAML frontmatter.
 * Never throws -- all errors are captured as diagnostics.
 */
export function loadSkillsFromDir({ dir, source }: LoadOptions): SkillsLoadResult {
  const skills: Skill[] = [];
  const diagnostics: SkillDiagnostic[] = [];

  // Check if directory exists
  if (!fs.existsSync(dir)) {
    return { skills, diagnostics };
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    diagnostics.push({
      type: 'error',
      message: `Failed to read directory: ${(err as Error).message}`,
      path: dir,
    });
    return { skills, diagnostics };
  }

  for (const entry of entries) {
    // Skip hidden dirs and node_modules
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    if (!entry.isDirectory()) continue;

    const parentDirName = entry.name;
    const skillDir = path.join(dir, parentDirName);
    const skillFile = path.join(skillDir, 'SKILL.md');

    try {
      if (!fs.existsSync(skillFile)) {
        continue;
      }

      const content = fs.readFileSync(skillFile, 'utf-8');
      const { frontmatter, body: _body } = parseFrontmatter(content);

      // Determine name: frontmatter.name or directory name
      const name = frontmatter.name || parentDirName;

      // Validate name (warning level, does not block loading)
      const nameErrors = validateSkillName(name, parentDirName);
      for (const err of nameErrors) {
        diagnostics.push({
          type: 'warning',
          message: `Skill "${name}": ${err}`,
          path: skillFile,
        });
      }

      // Validate description (missing description skips the skill)
      const descErrors = validateSkillDescription(frontmatter.description);
      if (descErrors.length > 0) {
        for (const err of descErrors) {
          diagnostics.push({
            type: 'warning',
            message: `Skill "${name}": ${err}`,
            path: skillFile,
          });
        }
        // description is required -- skip this skill
        if (!frontmatter.description || !frontmatter.description.trim()) {
          continue;
        }
      }

      const skill: Skill = {
        name,
        description: frontmatter.description!,
        filePath: skillFile,
        baseDir: skillDir,
        source,
        frontmatter,
        disableModelInvocation: frontmatter['disable-model-invocation'] === true,
        userInvocable: frontmatter['user-invocable'] !== false,
      };

      skills.push(skill);
    } catch (err) {
      diagnostics.push({
        type: 'error',
        message: `Failed to load skill from "${parentDirName}": ${(err as Error).message}`,
        path: skillFile,
      });
    }
  }

  return { skills, diagnostics };
}
