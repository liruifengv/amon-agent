import { describe, it, expect } from 'vitest';
import { SkillsSettingsSchema } from '@shared/schemas';
import { formatSkillsForPrompt } from '@/main/skills/skills-prompt';
import type { Skill } from '@shared/types';

// ---------------------------------------------------------------------------
// SkillsSettingsSchema
// ---------------------------------------------------------------------------

describe('SkillsSettingsSchema', () => {
  it('has correct default values', () => {
    const result = SkillsSettingsSchema.parse({});
    expect(result.extraDirs).toEqual(['.claude']);
    expect(result.disabledSkills).toEqual([]);
    expect(result.initialized).toBe(false);
  });

  it('accepts disabledSkills array', () => {
    const result = SkillsSettingsSchema.parse({
      disabledSkills: ['pdf', 'docx'],
    });
    expect(result.disabledSkills).toEqual(['pdf', 'docx']);
  });

  it('accepts initialized flag', () => {
    const result = SkillsSettingsSchema.parse({
      initialized: true,
    });
    expect(result.initialized).toBe(true);
  });

  it('preserves extraDirs when other fields are set', () => {
    const result = SkillsSettingsSchema.parse({
      extraDirs: ['.claude', '.custom'],
      disabledSkills: ['pdf'],
      initialized: true,
    });
    expect(result.extraDirs).toEqual(['.claude', '.custom']);
    expect(result.disabledSkills).toEqual(['pdf']);
    expect(result.initialized).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatSkillsForPrompt with disabledSkills
// ---------------------------------------------------------------------------

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'test-skill',
    description: 'A test skill',
    filePath: '/home/user/.amon/skills/test-skill/SKILL.md',
    baseDir: '/home/user/.amon/skills/test-skill',
    source: 'system-amon',
    frontmatter: {},
    disableModelInvocation: false,
    userInvocable: true,
    ...overrides,
  };
}

describe('formatSkillsForPrompt', () => {
  it('returns empty string when all skills are disabled', () => {
    const skills = [
      makeSkill({ name: 'pdf' }),
      makeSkill({ name: 'docx' }),
    ];
    const result = formatSkillsForPrompt(skills, ['pdf', 'docx']);
    expect(result).toBe('');
  });

  it('filters out disabled skills', () => {
    const skills = [
      makeSkill({ name: 'pdf', description: 'PDF processor' }),
      makeSkill({ name: 'docx', description: 'DOCX processor' }),
      makeSkill({ name: 'xlsx', description: 'XLSX processor' }),
    ];
    const result = formatSkillsForPrompt(skills, ['pdf']);
    expect(result).toContain('docx');
    expect(result).toContain('xlsx');
    expect(result).not.toContain('<name>pdf</name>');
  });

  it('filters out skills with disableModelInvocation', () => {
    const skills = [
      makeSkill({ name: 'active', description: 'Active skill' }),
      makeSkill({ name: 'disabled', description: 'Disabled skill', disableModelInvocation: true }),
    ];
    const result = formatSkillsForPrompt(skills);
    expect(result).toContain('active');
    expect(result).not.toContain('<name>disabled</name>');
  });

  it('combines both disableModelInvocation and disabledSkills filters', () => {
    const skills = [
      makeSkill({ name: 'a', description: 'Skill A' }),
      makeSkill({ name: 'b', description: 'Skill B', disableModelInvocation: true }),
      makeSkill({ name: 'c', description: 'Skill C' }),
    ];
    const result = formatSkillsForPrompt(skills, ['c']);
    expect(result).toContain('<name>a</name>');
    expect(result).not.toContain('<name>b</name>');
    expect(result).not.toContain('<name>c</name>');
  });

  it('returns all skills when disabledSkills is empty', () => {
    const skills = [
      makeSkill({ name: 'pdf', description: 'PDF processor' }),
      makeSkill({ name: 'docx', description: 'DOCX processor' }),
    ];
    const result = formatSkillsForPrompt(skills, []);
    expect(result).toContain('pdf');
    expect(result).toContain('docx');
  });

  it('defaults disabledSkills to empty array', () => {
    const skills = [
      makeSkill({ name: 'pdf', description: 'PDF processor' }),
    ];
    const result = formatSkillsForPrompt(skills);
    expect(result).toContain('pdf');
  });

  it('returns empty string for empty skills array', () => {
    const result = formatSkillsForPrompt([]);
    expect(result).toBe('');
  });

  it('includes XML skill entries in correct format', () => {
    const skills = [
      makeSkill({ name: 'pdf', description: 'PDF processor' }),
    ];
    const result = formatSkillsForPrompt(skills);
    expect(result).toContain('<available_skills>');
    expect(result).toContain('<skill>');
    expect(result).toContain('<name>pdf</name>');
    expect(result).toContain('<description>PDF processor</description>');
    expect(result).toContain('</available_skills>');
  });
});
