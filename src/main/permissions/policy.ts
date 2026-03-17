import path from 'node:path';
import type { ApprovalMode } from '@shared/permission-types';
import { resolveToCwd } from '../tools/utils/path-utils';

export type PermissionPolicyDecision = 'allow' | 'ask';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isWithinWorkspace(targetPath: string, cwd: string): boolean {
  const relative = path.relative(cwd, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function getPathArg(input: unknown): string | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  if (typeof input.file_path === 'string') {
    return input.file_path;
  }

  if (typeof input.path === 'string') {
    return input.path;
  }

  return undefined;
}

function isWorkspaceLocalTool(toolName: string): boolean {
  return toolName === 'Read'
    || toolName === 'Glob'
    || toolName === 'Grep'
    || toolName === 'Write'
    || toolName === 'Edit';
}

function isWorkspaceLocalTarget(toolName: string, input: unknown, cwd: string): boolean {
  if (!isWorkspaceLocalTool(toolName)) {
    return false;
  }

  const pathArg = getPathArg(input) ?? '.';
  const targetPath = resolveToCwd(pathArg, cwd);
  return isWithinWorkspace(targetPath, cwd);
}

export function evaluatePermissionPolicy(input: {
  mode: ApprovalMode;
  toolName: string;
  toolInput: unknown;
  cwd: string;
}): PermissionPolicyDecision {
  const { mode, toolName, toolInput, cwd } = input;

  if (toolName === 'AskUserQuestion') {
    return 'allow';
  }

  if (mode === 'yolo') {
    return 'allow';
  }

  if (mode === 'ask') {
    return 'ask';
  }

  if (mode === 'auto-edit' && isWorkspaceLocalTarget(toolName, toolInput, cwd)) {
    return 'allow';
  }

  return 'ask';
}
