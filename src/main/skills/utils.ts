import os from 'node:os';
import path from 'node:path';

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function normalizePath(input: string, cwd?: string): string {
  if (input.startsWith('~')) {
    return path.join(os.homedir(), input.slice(1));
  }
  if (path.isAbsolute(input)) return input;
  return path.resolve(cwd || process.cwd(), input);
}

export function compactPath(absolutePath: string): string {
  const home = os.homedir();
  if (absolutePath.startsWith(home)) {
    return '~' + absolutePath.slice(home.length);
  }
  return absolutePath;
}

export function validateSkillName(name: string, parentDirName: string): string[] {
  const errors: string[] = [];
  if (!name) { errors.push('name is required'); return errors; }
  if (name.length > 64) errors.push('name exceeds 64 characters');
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)) {
    errors.push('name must be lowercase alphanumeric with hyphens, not starting/ending with hyphen');
  }
  if (/--/.test(name)) errors.push('name must not contain consecutive hyphens');
  if (name !== parentDirName) errors.push(`name "${name}" does not match directory "${parentDirName}"`);
  return errors;
}

export function validateSkillDescription(description: string | undefined): string[] {
  const errors: string[] = [];
  if (!description || !description.trim()) { errors.push('description is required'); return errors; }
  if (description.length > 1024) errors.push('description exceeds 1024 characters');
  return errors;
}
